import { FormEvent, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import { firebaseClient } from '../firebase/client';
import { api } from '../api/client';
import {
  loadNotificationPreferences,
  NOTIFICATION_PREFERENCE_OPTIONS,
  saveNotificationPreferences,
  type NotificationPreferences,
} from '../notifications/preferences';
import { useAuth } from '../auth/AuthContext';
import { useNavigate } from 'react-router-dom';

const LEAD_UNIT_OPTIONS = [
  { label: 'Minutos', value: 'minutes' },
  { label: 'Horas', value: 'hours' },
  { label: 'Días', value: 'days' },
  { label: 'Semanas', value: 'weeks' },
  { label: 'Mes', value: 'months' },
  { label: 'Año', value: 'years' },
];

function minutesToUnit(totalMinutes: number): { amount: number; unit: string } {
  if (totalMinutes % (365 * 24 * 60) === 0) return { amount: totalMinutes / (365 * 24 * 60), unit: 'years' };
  if (totalMinutes % (30 * 24 * 60) === 0) return { amount: totalMinutes / (30 * 24 * 60), unit: 'months' };
  if (totalMinutes % (7 * 24 * 60) === 0) return { amount: totalMinutes / (7 * 24 * 60), unit: 'weeks' };
  if (totalMinutes % (24 * 60) === 0) return { amount: totalMinutes / (24 * 60), unit: 'days' };
  if (totalMinutes % 60 === 0) return { amount: totalMinutes / 60, unit: 'hours' };
  return { amount: totalMinutes, unit: 'minutes' };
}

function unitToMinutes(amount: number, unit: string): number {
  switch (unit) {
    case 'years': return amount * 365 * 24 * 60;
    case 'months': return amount * 30 * 24 * 60;
    case 'weeks': return amount * 7 * 24 * 60;
    case 'days': return amount * 24 * 60;
    case 'hours': return amount * 60;
    default: return amount;
  }
}

export default function SettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<NotificationPreferences>(loadNotificationPreferences);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [contrasenaActual, setContrasenaActual] = useState('');
  const [contrasenaNueva, setContrasenaNueva] = useState('');
  const [contrasenaConfirmacion, setContrasenaConfirmacion] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function updatePref(key: keyof NotificationPreferences, patch: Partial<(typeof prefs)[typeof key]>) {
    setPrefs((current) => {
      const next = { ...current, [key]: { ...current[key], ...patch } };
      saveNotificationPreferences(next);
      return next;
    });
  }

  function handleLeadTimeChange(key: 'activities' | 'classes', amountStr: string, unit: string) {
    const amount = Number(amountStr) || 0;
    const minutes = unitToMinutes(amount, unit);
    updatePref(key, { leadMinutes: Math.max(0, minutes) });
  }

  async function handleDeleteAccount() {
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await firebaseClient.deleteAccount();
      await logout();
      navigate('/login');
    } catch (err: any) {
      const msg = err?.code === 'auth/requires-recent-login'
        ? 'Debes haber iniciado sesión recientemente para eliminar tu cuenta. Cierra sesión y vuelve a iniciar antes de intentar.'
        : String(err?.message || 'No se pudo eliminar la cuenta');
      setDeleteError(msg);
    }
    setDeleteBusy(false);
  }

  async function onChangePassword(e: FormEvent) {
    e.preventDefault();
    setPasswordBusy(true);
    setPasswordError(null);
    setPasswordMessage(null);
    const res = await api.profile.changePassword(contrasenaActual, contrasenaNueva, contrasenaConfirmacion);
    if (!res.ok) {
      setPasswordError(res.error || 'No se pudo cambiar la contraseña');
    } else {
      setPasswordMessage('Contraseña actualizada correctamente');
      setContrasenaActual('');
      setContrasenaNueva('');
      setContrasenaConfirmacion('');
    }
    setPasswordBusy(false);
  }

  return (
    <PageStack>
      <PageHeader title="Configuración" subtitle="Preferencias de notificaciones y cuenta" />

      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Notificaciones
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Controla qué avisos recibe tu dispositivo y con cuánta anticipación.
          </Typography>
          <Stack spacing={2}>
            {NOTIFICATION_PREFERENCE_OPTIONS.map((option) => {
              const current = prefs[option.key];
              const lead = minutesToUnit(current.leadMinutes ?? (option.key === 'activities' ? 60 : 15));
              const isTimed = option.key === 'activities' || option.key === 'classes';
              return (
                <Box key={option.key} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }}>
                    <Box>
                      <Typography variant="subtitle2">{option.label}</Typography>
                      <Typography variant="body2" color="text.secondary">{option.description}</Typography>
                    </Box>
                    <Box
                      component="label"
                      sx={{ display: 'flex', alignItems: 'center', gap: 1, cursor: 'pointer' }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        {current.enabled ? 'Activadas' : 'Desactivadas'}
                      </Typography>
                      <Box
                        component="input"
                        type="checkbox"
                        checked={current.enabled}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updatePref(option.key, { enabled: e.target.checked })}
                        sx={{ width: 18, height: 18, cursor: 'pointer' }}
                      />
                    </Box>
                  </Stack>
                  {isTimed && current.enabled && (
                    <Stack direction="row" spacing={1} sx={{ mt: 1.5 }} alignItems="center">
                      <FormLabel component="legend" sx={{ fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
                        Anticipación:
                      </FormLabel>
                      <TextField
                        size="small"
                        type="number"
                        value={lead.amount}
                        onChange={(e) => handleLeadTimeChange(option.key as 'activities' | 'classes', e.target.value, lead.unit)}
                        slotProps={{ input: { min: 1, max: 999 } }}
                        sx={{ width: 80 }}
                      />
                      <FormControl size="small" sx={{ minWidth: 120 }}>
                        <Select
                          value={lead.unit}
                          onChange={(e) => handleLeadTimeChange(option.key as 'activities' | 'classes', String(lead.amount), e.target.value)}
                        >
                          {LEAD_UNIT_OPTIONS.map((u) => (
                            <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Stack>
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
          {passwordMessage && <Alert severity="success" sx={{ mb: 2 }}>{passwordMessage}</Alert>}
          {passwordError && <Alert severity="error" sx={{ mb: 2 }}>{passwordError}</Alert>}
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
                autoComplete="new-password"
                fullWidth
              />
              <TextField
                label="Confirmar nueva"
                type="password"
                value={contrasenaConfirmacion}
                onChange={(e) => setContrasenaConfirmacion(e.target.value)}
                required
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

      <Card sx={{ border: '1.5px solid', borderColor: 'error.main' }}>
        <CardContent>
          <Typography variant="h6" color="error.main" gutterBottom>
            Zona de peligro
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Estas acciones son irreversibles. Eliminar tu cuenta borrará permanentemente todos tus datos.
          </Typography>
          <Button
            variant="outlined"
            color="error"
            onClick={() => {
              setDeleteConfirmEmail('');
              setDeleteError(null);
              setDeleteDialogOpen(true);
            }}
          >
            Eliminar cuenta
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Eliminar cuenta</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Esta acción es <strong>irreversible</strong>. Se eliminarán todos tus datos, notas, actividades, horario y conexiones permanentemente.
          </Typography>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Escribe tu correo electrónico para confirmar:
          </Typography>
          <TextField
            fullWidth
            placeholder="tu@correo.com"
            value={deleteConfirmEmail}
            onChange={(e) => setDeleteConfirmEmail(e.target.value)}
            autoFocus
          />
          {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
          <Button
            variant="contained"
            color="error"
            disabled={deleteBusy || !deleteConfirmEmail.trim()}
            onClick={handleDeleteAccount}
          >
            {deleteBusy ? 'Eliminando…' : 'Eliminar permanentemente'}
          </Button>
        </DialogActions>
      </Dialog>
    </PageStack>
  );
}
