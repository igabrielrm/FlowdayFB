import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { Link as RouterLink } from 'react-router-dom';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import type { Profile } from '../types/profile';
import { assetUrl } from '../platform';
import { GENERO_OPTIONS, applyTheme, profileInitials } from '../types/profile';
import { glassButton } from '../theme/glass';

export default function ProfilePage() {
  const theme = useTheme();
  const { user, refresh, loading: authLoading } = useAuth();

  // Mostrar vista de invitado si no hay usuario o es anónimo
  if (!authLoading && (!user || user.isAnonymous)) {
    return (
      <PageStack>
        <PageHeader title="Mi Perfil" subtitle="Tu cuenta" />
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh', p: 3 }}>
          <Card sx={{ maxWidth: 400, textAlign: 'center', p: 3, borderRadius: 3 }}>
            <Avatar
              sx={{
                width: 72,
                height: 72,
                mx: 'auto',
                mb: 2,
                bgcolor: 'primary.main',
                fontSize: '2rem',
              }}
            >
              👤
            </Avatar>
            <Typography fontWeight="bold" gutterBottom variant="h5">
              Modo Invitado
            </Typography>
            <Typography color="text.secondary" variant="body2" sx={{ mb: 3, maxWidth: 400, mx: 'auto' }}>
              Estás usando la aplicación como invitado. Inicia sesión para guardar tu información, sincronizar en la nube y acceder a todas las funciones.
            </Typography>
            <Button
              component={RouterLink}
              to="/login"
              size="large"
              variant="contained"
              sx={{ borderRadius: 2, px: 4 }}
            >
              Iniciar Sesión / Registrarse
            </Button>
          </Card>
        </Box>
      </PageStack>
    );
  }
  const fileRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [genero, setGenero] = useState<string>(GENERO_OPTIONS[0]);

  const [reloadDialogOpen, setReloadDialogOpen] = useState(false);
  const [pendingTheme, setPendingTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    api.profile.get().then((res) => {
      if (res.ok && res.data) {
        fillForm(res.data);
        if (res.data.tema) applyTheme(res.data.tema);
      } else {
        setError(res.error || 'No se pudo cargar el perfil');
      }
      setLoading(false);
    });
  }, []);

  function fillForm(data: Profile) {
    setProfile(data);
    setNombre(data.nombre);
    setTelefono(data.telefono || '');
    setFechaNacimiento(data.fechaNacimiento || '');
    setGenero(data.genero || GENERO_OPTIONS[0]);
  }

  async function onSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    const res = await api.profile.update({
      nombre,
      telefono: telefono || undefined,
      fechaNacimiento: fechaNacimiento || undefined,
      genero,
    });
    if (!res.ok || !res.data) {
      setError(res.error || 'No se pudo guardar');
    } else {
      fillForm(res.data);
      await refresh();
      setMessage('Perfil actualizado correctamente');
    }
    setSaving(false);
  }

  async function onToggleTheme() {
    const next = profile?.tema === 'light' ? 'dark' : 'light';
    const res = await api.profile.changeTheme(next);
    if (!res.ok || !res.data) {
      setError(res.error || 'No se pudo cambiar el tema');
      return;
    }
    fillForm(res.data);
    applyTheme(res.data.tema || 'dark');
    await refresh();
    setPendingTheme(next);
    setReloadDialogOpen(true);
  }

  async function onPhotoSelected(file?: File | null) {
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    setMessage(null);
    const res = await api.profile.uploadPhoto(file);
    if (!res.ok || !res.data) {
      setError(res.error || 'No se pudo subir la foto');
    } else {
      fillForm(res.data);
      await refresh();
      setMessage('Foto actualizada correctamente');
    }
    setPhotoBusy(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  if (loading) {
    return (
      <Stack alignItems="center" py={6}>
        <CircularProgress />
      </Stack>
    );
  }

  if (!profile) {
    return (
      <PageStack>
        <PageHeader title="Mi perfil" subtitle="Administra tu cuenta y preferencias" />
        <Alert severity="info">
          Aún no has iniciado sesión. <Button component={RouterLink} to="/login" sx={{ ml: 1 }} variant="outlined">Iniciar sesión</Button>
        </Alert>
      </PageStack>
    );
  }

  const avatarUrl = assetUrl(profile.foto) || null;

  return (
    <PageStack>
      <PageHeader
        title="Mi perfil"
        subtitle="Administra tu cuenta y preferencias"
        actions={
          <Button
            sx={glassButton(theme)}
            startIcon={profile.tema === 'light' ? <DarkModeIcon /> : <LightModeIcon />}
            onClick={() => onToggleTheme()}
          >
            {profile.tema === 'light' ? 'Oscuro' : 'Claro'}
          </Button>
        }
      />

      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
            <Avatar src={avatarUrl || undefined} sx={{ width: 72, height: 72, fontSize: 24 }}>
              {profileInitials(profile.nombre)}
            </Avatar>
            <Box>
              <Typography variant="h6">{profile.nombre}</Typography>
              <Typography variant="body2" color="text.secondary">
                {profile.correo}
              </Typography>
              {!user && (
                <Typography variant="caption" color="warning.main" display="block" sx={{ mt: 0.5 }}>
                  Sesión no activa. Inicia sesión para sincronizar y guardar tus cambios en la nube.
                </Typography>
              )}
              <Button size="small" disabled={photoBusy} onClick={() => fileRef.current?.click()} sx={{ mt: 1 }}>
                {photoBusy ? 'Subiendo…' : 'Cambiar foto'}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => onPhotoSelected(e.target.files?.[0])}
              />
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Card component="form" onSubmit={onSaveProfile}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Datos personales
          </Typography>
          <Stack spacing={2}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Nombre completo"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
                fullWidth
              />
              <TextField label="Correo" value={profile.correo ?? ''} disabled fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Teléfono"
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                inputProps={{ pattern: '\\d{10}', maxLength: 10 }}
                placeholder="0991234567"
                fullWidth
              />
              <TextField
                label="Fecha de nacimiento"
                type="date"
                value={fechaNacimiento}
                onChange={(e) => setFechaNacimiento(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            </Stack>
            <FormControl fullWidth>
              <InputLabel>Género</InputLabel>
              <Select label="Género" value={genero} onChange={(e) => setGenero(e.target.value)}>
                {GENERO_OPTIONS.map((g) => (
                  <MenuItem key={g} value={g}>
                    {g}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button type="submit" variant="contained" disabled={saving} sx={{ alignSelf: 'flex-start' }}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Dialog open={reloadDialogOpen} onClose={() => setReloadDialogOpen(false)}>
        <DialogTitle>Tema actualizado</DialogTitle>
        <DialogContent>
          <Typography>
            El tema cambió a <strong>{pendingTheme === 'light' ? 'claro' : 'oscuro'}</strong>.
            Recarga la página para que todos los componentes carguen el estilo correctamente.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReloadDialogOpen(false)}>Después</Button>
          <Button variant="contained" onClick={() => window.location.reload()}>
            Recargar ahora
          </Button>
        </DialogActions>
      </Dialog>
    </PageStack>
  );
}
