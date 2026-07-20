import { FormEvent, useEffect, useState } from 'react';
import { Link as RouterLink, Navigate, useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Divider,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useAuth } from '../auth/AuthContext';
import AuthShell from '../components/mui/AuthShell';

export default function LoginPage() {
  const { user, login, loginWithGoogle, continueAsGuest } = useAuth();
  const [searchParams] = useSearchParams();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const err = await login(correo, contrasena);
    if (err) setError(err);
    setSubmitting(false);
  }

  async function handleGoogleLogin() {
    setSubmitting(true);
    setError(null);
    const err = await loginWithGoogle();
    if (err) setError(err);
    setSubmitting(false);
  }

  async function handleGuestAccess() {
    setSubmitting(true);
    setError(null);
    const err = await continueAsGuest();
    if (err) setError(err);
    setSubmitting(false);
  }

  return (
    <AuthShell>
      <Stack component="form" spacing={2.5} onSubmit={onSubmit}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h4" color="primary.main">
            Flowday
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Plan your day, own your flow.
          </Typography>
        </Box>

        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="Correo"
          type="email"
          value={correo}
          onChange={(e) => setCorreo(e.target.value)}
          required
          autoComplete="email"
        />
        <TextField
          label="Contraseña"
          type="password"
          value={contrasena}
          onChange={(e) => setContrasena(e.target.value)}
          required
          autoComplete="current-password"
        />

        <Button type="submit" variant="contained" size="large" disabled={submitting}>
          {submitting ? 'Entrando…' : 'Iniciar sesión'}
        </Button>

        <Divider>o continúa con</Divider>
        <Stack spacing={1}>
          <Button variant="outlined" onClick={handleGoogleLogin} disabled={submitting}>
            Continuar con Google
          </Button>
          <Button variant="text" onClick={handleGuestAccess} disabled={submitting}>
            Continuar como invitado
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          ¿No tienes cuenta?{' '}
          <Link component={RouterLink} to="/register">
            Regístrate
          </Link>
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          <Link component={RouterLink} to="/forgot-password">
            ¿Olvidaste tu contraseña?
          </Link>
        </Typography>
      </Stack>
    </AuthShell>
  );
}
