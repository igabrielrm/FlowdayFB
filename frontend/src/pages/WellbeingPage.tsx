import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { api } from '../api/client';
import { OFFLINE_QUEUE_EVENT } from '../events';
import { readApiGet } from '../offline/cache';
import { usePomodoroTimer } from '../hooks/usePomodoroTimer';
import BreathingModal from '../components/BreathingModal';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import { glassSurface } from '../theme/glass';
import type { ActividadListItem } from '../types/activity';
import {
  POMODORO_WORK_MIN,
  POMODORO_WORK_PRESETS,
  StressReport,
  WellbeingStats,
  stressLevelLabel,
} from '../types/wellbeing';

function formatTimer(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function WellbeingPage() {
  const theme = useTheme();
  const [stats, setStats] = useState<WellbeingStats | null>(null);
  const [stress, setStress] = useState<StressReport | null>(null);
  const [activities, setActivities] = useState<ActividadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [breathingOpen, setBreathingOpen] = useState(false);
  const [customMinutes, setCustomMinutes] = useState(String(POMODORO_WORK_MIN));

  const pomodoro = usePomodoroTimer(POMODORO_WORK_MIN);

  const refresh = useCallback(async () => {
    setLoading(true);
    // Load from cache first for instant UI
    const cachedStats = readApiGet<WellbeingStats>('/api/bienestar/estadisticas');
    const cachedStress = readApiGet<StressReport>('/api/bienestar/estres');
    const cachedActivities = readApiGet<ActividadListItem[]>('/api/v1/activities');
    if (cachedStats) setStats(cachedStats);
    if (cachedStress) setStress(cachedStress);
    if (cachedActivities) {
      setActivities(cachedActivities.filter((a) => a.estado !== 'COMPLETADA'));
    }
    setLoading(false);
    // Then fetch from server
    const [statsRes, stressRes, actRes] = await Promise.all([
      api.bienestar.stats(),
      api.bienestar.stress(),
      api.activities.list(),
    ]);
    if (statsRes.ok && statsRes.data) setStats(statsRes.data);
    if (stressRes.ok && stressRes.data) setStress(stressRes.data);
    if (actRes.ok && actRes.data) {
      setActivities(actRes.data.filter((a) => a.estado !== 'COMPLETADA'));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onQueue = () => refresh();
    window.addEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    };
  }, [refresh]);

  useEffect(() => {
    pomodoro.onWorkComplete((mins) => {
      api.bienestar.savePomodoro(mins).then((res) => {
        if (!res.error) {
          const nextCycle = pomodoro.cycleCount;
          if (nextCycle >= pomodoro.cyclesTotal) {
            setToast(`¡Ciclo ${nextCycle} completado! Toma una pausa larga de ${pomodoro.longBreakMinutes} min.`);
          } else {
            setToast(`¡Enfoque de ${mins} min! Descansa ${pomodoro.shortBreakMinutes} min. (ciclo ${nextCycle}/${pomodoro.cyclesTotal})`);
          }
          refresh();
        }
      });
    });
    pomodoro.onBreakComplete(() => {
      setToast('Descanso listo. ¡A por otro ciclo!');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onActivityLink(id: number | '') {
    pomodoro.setLinkedActivityId(id);
    if (!id) return;
    const act = activities.find((a) => a.id === id);
    if (!act?.duracionMinutos) return;
    const mins = Math.max(5, Math.min(120, act.duracionMinutos));
    pomodoro.applyWorkDuration(mins);
    setCustomMinutes(String(mins));
  }

  function applyCustomMinutes() {
    const mins = parseInt(customMinutes, 10);
    if (!Number.isNaN(mins) && mins >= 5 && mins <= 120) {
      pomodoro.applyWorkDuration(mins);
    }
  }

  async function onBreathingComplete() {
    const res = await api.bienestar.savePause('RESPIRACION', 3);
    if (res.error) setError(res.error);
    else {
      setToast(res.data?.mensaje || 'Respiración registrada');
      refresh();
    }
  }

  const nivel = stress?.nivel ?? 0;
  const phaseLabel =
    pomodoro.phase === 'work'
      ? `Enfoque · ${pomodoro.workMinutes} min`
      : pomodoro.phase === 'break'
        ? `Descanso corto · ${pomodoro.shortBreakMinutes} min`
        : pomodoro.phase === 'longBreak'
          ? `Pausa larga · ${pomodoro.longBreakMinutes} min`
          : 'Listo para empezar';

  return (
    <PageStack>
      <PageHeader
        title="Bienestar"
        subtitle="Pomodoro clásico: 25 min enfoque, 5 min descanso, pausa larga tras 4 ciclos."
      />

      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
        onClose={() => setToast(null)}
        message={toast}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      />
      {error && <Alert severity="error">{error}</Alert>}

      {stress && (
        <Card sx={{ ...glassSurface(theme, { strong: true }), borderColor: nivel >= 70 ? 'error.main' : nivel >= 40 ? 'warning.main' : 'success.main' }}>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
              <Box flex={1}>
                <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                  Nivel de estrés
                </Typography>
                <LinearProgress variant="determinate" value={nivel} sx={{ height: 10, borderRadius: 5, mb: 1 }} />
                <Typography fontWeight={700}>
                  {nivel}% — {stressLevelLabel(nivel)}
                </Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  {stress.consejo}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2.5} alignItems="stretch">
        <Card sx={{ flex: 1, ...glassSurface(theme, { strong: true }) }}>
          <CardContent>
            <Stack spacing={3} alignItems="center" sx={{ maxWidth: 440, mx: 'auto', width: '100%' }}>
              <Box width="100%">
                <Typography variant="h6" fontWeight={700} gutterBottom>
                  Temporizador Pomodoro
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {phaseLabel}
                </Typography>
                <Chip
                  label={`Ciclo ${Math.min(pomodoro.cycleCount, pomodoro.cyclesTotal)} de ${pomodoro.cyclesTotal}`}
                  size="small"
                  sx={{ mt: 1 }}
                />
              </Box>

              <FormControl fullWidth size="small" disabled={pomodoro.running}>
                <InputLabel>Vincular tarea</InputLabel>
                <Select
                  label="Vincular tarea"
                  value={pomodoro.linkedActivityId === '' ? '' : pomodoro.linkedActivityId}
                  onChange={(e) => onActivityLink(e.target.value === '' ? '' : Number(e.target.value))}
                >
                  <MenuItem value="">Sin tarea vinculada</MenuItem>
                  {activities.map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.titulo}
                      {a.duracionMinutos ? ` (${a.duracionMinutos} min)` : ''}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <Stack direction="row" flexWrap="wrap" gap={1} justifyContent="center" width="100%">
                {POMODORO_WORK_PRESETS.map((m) => (
                  <Chip
                    key={m}
                    label={`${m} min`}
                    clickable
                    color={pomodoro.workMinutes === m ? 'primary' : 'default'}
                    disabled={pomodoro.running}
                    onClick={() => {
                      pomodoro.applyWorkDuration(m);
                      setCustomMinutes(String(m));
                    }}
                  />
                ))}
              </Stack>

              <Stack direction="row" spacing={1} width="100%" alignItems="center">
                <TextField
                  label="Minutos personalizados"
                  type="number"
                  size="small"
                  value={customMinutes}
                  onChange={(e) => setCustomMinutes(e.target.value)}
                  disabled={pomodoro.running}
                  inputProps={{ min: 5, max: 120 }}
                  sx={{ flex: 1 }}
                />
                <Button variant="outlined" onClick={applyCustomMinutes} disabled={pomodoro.running}>
                  Aplicar
                </Button>
              </Stack>

              <Typography variant="caption" color="text.secondary" textAlign="center">
                Descanso corto: <strong>{pomodoro.shortBreakMinutes} min</strong> · Pausa larga (×4):{' '}
                <strong>{pomodoro.longBreakMinutes} min</strong>
              </Typography>

              <Box
                sx={{
                  width: { xs: 200, sm: 240 },
                  height: { xs: 200, sm: 240 },
                  borderRadius: '50%',
                  border: 4,
                  borderColor:
                    pomodoro.phase === 'longBreak'
                      ? 'warning.main'
                      : pomodoro.phase === 'break'
                        ? 'secondary.main'
                        : 'primary.main',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: { xs: '2rem', sm: '2.75rem' },
                  fontWeight: 700,
                  mx: 'auto',
                }}
              >
                {formatTimer(pomodoro.secondsLeft)}
              </Box>

              <Stack direction="row" justifyContent="center" spacing={1}>
                {!pomodoro.running ? (
                  <Button variant="contained" onClick={() => pomodoro.start()}>
                    {pomodoro.phase === 'idle'
                      ? 'Iniciar'
                      : pomodoro.phase === 'break' || pomodoro.phase === 'longBreak'
                        ? 'Saltar descanso'
                        : 'Continuar'}
                  </Button>
                ) : (
                  <Button variant="contained" onClick={() => pomodoro.pause()}>
                    Pausar
                  </Button>
                )}
                <Button variant="outlined" onClick={() => pomodoro.reset()}>
                  Reiniciar
                </Button>
              </Stack>

              {!loading && stats && (
                <Typography variant="body2" color="text.secondary" textAlign="center">
                  Esta semana: <strong>{stats.totalPomodoros}</strong> ciclos · <strong>{stats.minutosPomodoro}</strong> min
                </Typography>
              )}
            </Stack>
          </CardContent>
        </Card>

        <Card sx={{ width: { xs: '100%', lg: 300 }, flexShrink: 0, ...glassSurface(theme, { strong: true }) }}>
          <CardContent>
            <Stack spacing={2} height="100%">
              <Typography variant="h6" fontWeight={700}>
                Respiración 4-4-6
              </Typography>
              <Typography variant="body2" color="text.secondary" lineHeight={1.6}>
                Técnica guiada para calmar la ansiedad: inhala 4 s, mantén 4 s, exhala 6 s. Ideal entre ciclos de estudio.
              </Typography>
              <Box fontSize={48} textAlign="center" py={2}>
                🌬️
              </Box>
              <Button variant="contained" fullWidth onClick={() => setBreathingOpen(true)}>
                Iniciar guía de respiración
              </Button>
              <Typography variant="caption" color="text.secondary" textAlign="center">
                4 rondas · ~3 min
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <BreathingModal
        open={breathingOpen}
        onClose={() => setBreathingOpen(false)}
        onComplete={onBreathingComplete}
      />
    </PageStack>
  );
}
