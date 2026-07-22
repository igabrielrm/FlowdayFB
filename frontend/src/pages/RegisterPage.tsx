import { FormEvent, useState } from 'react';
import { Link as RouterLink, Navigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  Link,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';
import AuthShell from '../components/mui/AuthShell';

const GENERO = ['Masculino', 'Femenino', 'Otro', 'Prefiero no decir'];

export default function RegisterPage() {
  const { user } = useAuth();
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [telefono, setTelefono] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [genero, setGenero] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await api.register({
      nombre,
      correo,
      contrasena,
      telefono,
      fechaNacimiento: fechaNacimiento || undefined,
      genero: genero || undefined,
    });
    if (!res.ok) setError(res.error || 'No se pudo registrar');
    else setDone(true);
    setSubmitting(false);
  }

  if (done) {
    return (
      <AuthShell>
        <Stack spacing={2} textAlign="center">
          <Typography variant="h5">Cuenta creada</Typography>
          <Typography color="text.secondary">Ya puedes iniciar sesión en Flowday.</Typography>
          <Button component={RouterLink} to="/login" variant="contained" size="large">
            Ir al login
          </Button>
        </Stack>
      </AuthShell>
    );
  }

  return (
    <AuthShell maxWidth={480}>
      <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
        <Box textAlign="center">
          <Typography variant="h4" color="primary.main">
            Crear cuenta
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        <TextField label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        <TextField
          label="Correo"
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          required
        />
        <TextField
          label="Contraseña"
          type="password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          required
          inputProps={{ minLength: 8 }}
        />
        <TextField
          label="Teléfono (10 dígitos)"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          required
          inputProps={{ pattern: '\\d{10}', maxLength: 10 }}
        />
        <TextField
          label="Fecha de nacimiento"
          type="date"
          value={fechaNacimiento}
          onChange={(e) => setFechaNacimiento(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <FormControl>
          <InputLabel>Género</InputLabel>
          <Select label="Género" value={genero} onChange={(e) => setGenero(e.target.value)}>
            <MenuItem value="">—</MenuItem>
            {GENERO.map((g) => (
              <MenuItem key={g} value={g}>
                {g}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Button type="submit" variant="contained" size="large" disabled={submitting}>
          {submitting ? 'Creando…' : 'Registrarme'}
        </Button>

        <Typography variant="body2" color="text.secondary" textAlign="center">
          ¿Ya tienes cuenta?{' '}
          <Link component={RouterLink} to="/login">
            Iniciar sesión
          </Link>
        </Typography>
      </Stack>
    </AuthShell>
  );
}
