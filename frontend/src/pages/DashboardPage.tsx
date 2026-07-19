import { Link as RouterLink } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Divider,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { api } from '../api/client';
import { OFFLINE_QUEUE_EVENT } from '../events';
import { readApiGet } from '../offline/cache';
import ActivityDetailModal from '../components/ActivityDetailModal';
import RescheduleModal from '../components/RescheduleModal';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import { glassButton, glassSurface } from '../theme/glass';
import type { ActividadListItem, PriorityAlert } from '../types/activity';
import { estadoLabel, formatDate, tipoLabel } from '../types/activity';
import type { ScheduleAlert } from '../types/schedule';
import { localDateIso, shiftLocalDateIso } from '../utils/localDate';

function todayIso() {
  return localDateIso();
}

function shiftDate(iso: string, days: number) {
  return shiftLocalDateIso(iso, days);
}

function agendaTitle(viewDate: string): string {
  const today = todayIso();
  const tomorrow = shiftDate(today, 1);
  if (viewDate === today) return 'Agenda de hoy';
  if (viewDate === tomorrow) return 'Agenda de mañana';
  return `Agenda del ${formatDate(viewDate)}`;
}

export default function DashboardPage() {
  const theme = useTheme();
  const [viewDate, setViewDate] = useState(todayIso());
  const [dayItems, setDayItems] = useState<ActividadListItem[]>([]);
  const [alerts, setAlerts] = useState<PriorityAlert[]>([]);
  const [scheduleAlert, setScheduleAlert] = useState<ScheduleAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  const loadAlerts = useCallback(async () => {
    const alertsRes = await api.activities.priorityAlerts();
    if (alertsRes.ok && alertsRes.data) setAlerts(alertsRes.data);
  }, []);

  const loadDay = useCallback(async () => {
    // Load from cache first for instant UI
    const cachedDay = readApiGet<ActividadListItem[]>(`/api/v1/activities/by-date?fecha=${viewDate}`);
    const cachedSched = readApiGet<ScheduleAlert>('/api/v1/schedule/alert');
    if (cachedDay) setDayItems(cachedDay);
    if (cachedSched) setScheduleAlert(cachedSched);
    setLoading(false);
    // Then fetch from server in background
    const [dayRes, schedRes] = await Promise.all([
      api.activities.byDate(viewDate),
      api.schedule.alert(),
    ]);
    if (dayRes.ok && dayRes.data) setDayItems(dayRes.data);
    if (schedRes.ok) setScheduleAlert(schedRes.data as ScheduleAlert | null);
  }, [viewDate]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    loadDay();
  }, [loadDay]);

  useEffect(() => {
    const onQueue = () => {
      loadAlerts();
      loadDay();
    };
    window.addEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    };
  }, [loadAlerts, loadDay]);

  const urgentAlerts = alerts;

  return (
    <PageStack>
      <PageHeader
        title="Inicio"
        subtitle={`Agenda — ${formatDate(viewDate)}`}
        actions={
          <>
            <Button onClick={() => setRescheduleOpen(true)} sx={glassButton(theme)}>
              Reagendar
            </Button>
            <Button variant="contained" component={RouterLink} to="/activities/new">
              + Nueva
            </Button>
          </>
        }
      />

      {urgentAlerts.length > 0 && (
        <Card sx={{ ...glassSurface(theme, { strong: true }), borderColor: 'warning.main' }}>
          <CardContent>
            <Stack direction="row" spacing={1.5} alignItems="center" mb={2}>
              <WarningAmberIcon color="warning" />
              <Typography variant="h6" fontWeight={700}>
                Tareas urgentes o prioridad alta
              </Typography>
              <Chip label={urgentAlerts.length} size="small" color="warning" />
            </Stack>
            <Stack spacing={1.25}>
              {urgentAlerts.slice(0, 5).map((a) => (
                <Stack
                  key={a.id}
                  direction={{ xs: 'column', sm: 'row' }}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                  justifyContent="space-between"
                  sx={{ p: 1.5, borderRadius: 2, bgcolor: 'action.hover', gap: 1 }}
                >
                  <Button
                    onClick={() => setDetailId(a.id)}
                    sx={{
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      flex: 1,
                      py: 0.5,
                      color: 'text.primary',
                      whiteSpace: 'normal',
                    }}
                  >
                    {a.titulo}
                  </Button>
                  {a.prioridad === 'ALTA' && <Chip label="Alta" size="small" color="warning" />}
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      )}

      {scheduleAlert && (
        <Card sx={glassSurface(theme)}>
          <CardContent>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'flex-start', sm: 'center' }}>
              <Typography fontSize={28}>{scheduleAlert.enCurso ? '📚' : '⏰'}</Typography>
              <Box flex={1} minWidth={0}>
                <Typography fontWeight={700}>{scheduleAlert.materia}</Typography>
                <Typography variant="body2" color="text.secondary" mt={0.5}>
                  {scheduleAlert.mensaje}
                </Typography>
              </Box>
              <Button component={RouterLink} to="/schedule" variant="outlined" sx={{ flexShrink: 0 }}>
                Ver horario
              </Button>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Card sx={glassSurface(theme, { strong: true })}>
        <Box
          sx={{
            px: 2.5,
            pt: 2.5,
            pb: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 1.5,
          }}
        >
          <IconButton onClick={() => setViewDate(shiftDate(viewDate, -1))} sx={glassButton(theme)}>
            <ChevronLeftIcon />
          </IconButton>
          <Box textAlign="center" sx={{ minWidth: 180 }}>
            <Typography variant="h6" fontWeight={700}>
              {agendaTitle(viewDate)}
            </Typography>
            <Typography variant="body2" color="text.secondary" mt={0.5}>
              {dayItems.length} actividad{dayItems.length === 1 ? '' : 'es'}
            </Typography>
          </Box>
          <IconButton onClick={() => setViewDate(shiftDate(viewDate, 1))} sx={glassButton(theme)}>
            <ChevronRightIcon />
          </IconButton>
        </Box>

        <Divider />

        <CardContent sx={{ pt: 2.5 }}>
          {loading ? (
            <Typography color="text.secondary">Cargando…</Typography>
          ) : dayItems.length === 0 ? (
            <Typography color="text.secondary">No hay actividades para este día.</Typography>
          ) : (
            <Stack spacing={1.5}>
              {dayItems.map((a) => (
                <Stack
                  key={a.id}
                  direction="row"
                  component="button"
                  onClick={() => setDetailId(a.id)}
                  spacing={1.5}
                  alignItems="center"
                  sx={{
                    width: '100%',
                    textAlign: 'left',
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: 2.5,
                    p: 1.75,
                    bgcolor: 'background.paper',
                    cursor: 'pointer',
                    color: 'text.primary',
                    transition: 'box-shadow 0.2s',
                    '&:hover': { boxShadow: 2 },
                  }}
                >
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: a.color || '#5082ef',
                      flexShrink: 0,
                    }}
                  />
                  <Box flex={1}>
                    <Typography fontWeight={600}>{a.titulo}</Typography>
                    <Typography variant="body2" color="text.secondary" mt={0.25}>
                      {a.horaInicio ? a.horaInicio.slice(0, 5) : 'Sin hora'} · {tipoLabel(a.tipo)}
                    </Typography>
                  </Box>
                  <Chip label={estadoLabel(a.estado)} size="small" variant="outlined" />
                </Stack>
              ))}
            </Stack>
          )}
        </CardContent>
        <CardActions sx={{ justifyContent: 'space-between', px: 2.5, pb: 2.5, pt: 0 }}>
          <Button component={RouterLink} to="/activities">
            Ver todas
          </Button>
          <Button component={RouterLink} to={`/activities/new?fecha=${viewDate}`} variant="contained" size="small">
            + Agregar
          </Button>
        </CardActions>
      </Card>

      <ActivityDetailModal activityId={detailId} onClose={() => setDetailId(null)} onChanged={() => { loadDay(); loadAlerts(); }} />
      <RescheduleModal open={rescheduleOpen} onClose={() => setRescheduleOpen(false)} onDone={() => { loadDay(); loadAlerts(); }} />
    </PageStack>
  );
}
