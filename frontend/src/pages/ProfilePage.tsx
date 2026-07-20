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
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import type { Profile } from '../types/profile';
import { assetUrl } from '../platform';
import { GENERO_OPTIONS, applyTheme, profileInitials } from '../types/profile';
import { glassButton } from '../theme/glass';
import {
  loadNotificationPreferences,
  NOTIFICATION_PREFERENCE_OPTIONS,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '../notifications/preferences';
import { FormControlLabel, Switch } from '@mui/material';

export default function ProfilePage() {
  const theme = useTheme();
  const { refresh } = useAuth();
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
  const [genero, setGenero] = useState('');

  const [contrasenaActual, setContrasenaActual] = useState('');
  const [contrasenaNueva, setContrasenaNueva] = useState('');
  const [contrasenaConfirmacion, setContrasenaConfirmacion] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [reloadDialogOpen, setReloadDialogOpen] = useState(false);
  const [pendingTheme, setPendingTheme] = useState<'light' | 'dark'>('dark');
  const [prefs, setPrefs] = useState<NotificationPreferences>(loadNotificationPreferences());

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

  function updatePref(key: keyof NotificationPreferences, patch: Partial<(typeof prefs)[typeof key]>) {
    setPrefs((current) => {
      const next = { ...current, [key]: { ...current[key], ...patch } };
      saveNotificationPreferences(next);
      return next;
    });
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

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordBusy(true);
    setError(null);
    setMessage(null);
    const res = await api.profile.changePassword(contrasenaActual, contrasenaNueva, contrasenaConfirmacion);
    if (!res.ok) {
      setError(res.error || 'No se pudo cambiar la contraseña');
    } else {
      setMessage('Contraseña actualizada correctamente');
      setContrasenaActual('');
      setContrasenaNueva('');
      setContrasenaConfirmacion('');
    }
    setPasswordBusy(false);
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
    return <Alert severity="error">{error || 'Perfil no disponible'}</Alert>;
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
              <TextField label="Correo" value={profile.correo} disabled fullWidth />
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
                InputLabelProps={{ shrink: true }}
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

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Notificaciones móviles
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Controla qué avisos recibe la app en tu dispositivo y con cuánta anticipación.
          </Typography>
          <Stack spacing={2}>
            {NOTIFICATION_PREFERENCE_OPTIONS.map((option) => {
              const current = prefs[option.key];
              return (
                <Box key={option.key} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                    <Box>
                      <Typography variant="subtitle2">{option.label}</Typography>
                      <Typography variant="body2" color="text.secondary">{option.description}</Typography>
                    </Box>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={current.enabled}
                          onChange={(_, checked) => updatePref(option.key, { enabled: checked })}
                        />
                      }
                      label={current.enabled ? 'Activadas' : 'Desactivadas'}
                    />
                  </Stack>
                  {(option.key === 'activities' || option.key === 'classes') && (
                    <TextField
                      label="Minutos de anticipación"
                      type="number"
                      size="small"
                      value={current.leadMinutes ?? (option.key === 'activities' ? 60 : 15)}
                      onChange={(e) => updatePref(option.key, { leadMinutes: Number(e.target.value) || 0 })}
                      sx={{ mt: 1.5, maxWidth: 220 }}
                      inputProps={{ min: 0, max: 1440 }}
                    />
                  )}
                </Box>
              );
            })}
          </Stack>
        </CardContent>
      </Card>

      <Card component="form" onSubmit={onChangePassword}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Seguridad
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Contraseña actual"
              type="password"
              value={contrasenaActual}
              onChange={(e) => setContrasenaActual(e.target.value)}
              required
              autoComplete="current-password"
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Nueva contraseña"
                type="password"
                value={contrasenaNueva}
                onChange={(e) => setContrasenaNueva(e.target.value)}
                required
                inputProps={{ minLength: 8 }}
                autoComplete="new-password"
                fullWidth
              />
              <TextField
                label="Confirmar nueva"
                type="password"
                value={contrasenaConfirmacion}
                onChange={(e) => setContrasenaConfirmacion(e.target.value)}
                required
                inputProps={{ minLength: 8 }}
                autoComplete="new-password"
                fullWidth
              />
            </Stack>
            <Button type="submit" variant="outlined" disabled={passwordBusy} sx={{ alignSelf: 'flex-start' }}>
              {passwordBusy ? 'Actualizando…' : 'Actualizar contraseña'}
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
