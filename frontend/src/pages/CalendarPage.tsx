import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  useTheme,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { api } from '../api/client';
import type { ActividadListItem } from '../types/activity';
import DayActivitiesModal from '../components/DayActivitiesModal';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import { glassButton, glassSurface } from '../theme/glass';
import {
  WEEKDAYS,
  buildMonthGrid,
  dayPriorityStyle,
  expandRecurringActivities,
  groupByDate,
  monthLabel,
  type CalendarView,
} from '../types/calendar';

const MONTHS_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const YEAR_MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function CalendarPage() {
  const theme = useTheme();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [view, setView] = useState<CalendarView>('month');
  const [activities, setActivities] = useState<ActividadListItem[]>([]);
  const [yearActivities, setYearActivities] = useState<ActividadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  const loadMonth = useCallback(async () => {
    setLoading(true);
    const res = await api.activities.byMonth(year, month);
    if (res.ok && res.data) setActivities(res.data);
    setLoading(false);
  }, [month, year]);

  const loadYear = useCallback(async () => {
    setLoading(true);
    const all: ActividadListItem[] = [];
    for (let m = 1; m <= 12; m++) {
      const res = await api.activities.byMonth(year, m);
      if (res.ok && res.data) all.push(...res.data);
    }
    setYearActivities(all);
    setLoading(false);
  }, [year]);

  useEffect(() => {
    if (view === 'month') loadMonth();
    else loadYear();
  }, [loadMonth, loadYear, view]);

  const expandedActivities = useMemo(
    () => expandRecurringActivities(activities, year, month),
    [activities, year, month],
  );
  const byDate = useMemo(() => groupByDate(expandedActivities), [expandedActivities]);
  const cells = useMemo(() => buildMonthGrid(year, month), [month, year]);

  const yearByDate = useMemo(() => {
    const map: Record<string, ActividadListItem[]> = {};
    for (const a of yearActivities) {
      if (!a.fechaInicio) continue;
      const key = a.fechaInicio.split('T')[0];
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return map;
  }, [yearActivities]);

  function goPrev() {
    if (view === 'year') {
      setYear((y) => y - 1);
    } else if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goNext() {
    if (view === 'year') {
      setYear((y) => y + 1);
    } else if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  }

  function goToday() {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
  }

  function monthActivityCount(m: number) {
    const start = `${year}-${String(m).padStart(2, '0')}-01`;
    const diasEnMes = new Date(year, m, 0).getDate();
    const end = `${year}-${String(m).padStart(2, '0')}-${String(diasEnMes).padStart(2, '0')}`;
    return Object.keys(yearByDate).filter((k) => k >= start && k <= end).reduce((sum, k) => sum + (yearByDate[k]?.length ?? 0), 0);
  }

  return (
    <PageStack>
      <PageHeader
        title="Calendario"
        subtitle={view === 'month' ? 'Vista mensual de tus actividades' : `Vista anual ${year}`}
        actions={
          <Stack direction="row" spacing={0.75} alignItems="center">
            <ToggleButtonGroup
              value={view}
              exclusive
              onChange={(_, v) => v && setView(v)}
              size="small"
              sx={{ mr: 1 }}
            >
              <ToggleButton value="month" sx={{ px: 1.5, py: 0.25 }}>Mes</ToggleButton>
              <ToggleButton value="year" sx={{ px: 1.5, py: 0.25 }}>Año</ToggleButton>
            </ToggleButtonGroup>
            <IconButton size="small" onClick={goPrev} sx={glassButton(theme)}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <Button
              size="small"
              onClick={goToday}
              disabled={view === 'year' ? year === today.getFullYear() : isCurrentMonth}
              sx={{
                ...glassButton(theme),
                minWidth: 120,
                borderRadius: 2.5,
                px: 2,
              }}
            >
              {view === 'month' ? monthLabel(year, month) : String(year)}
            </Button>
            <IconButton size="small" onClick={goNext} sx={glassButton(theme)}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Stack>
        }
      />

      {view === 'month' ? (
        <Card sx={glassSurface(theme, { strong: true })}>
          <CardContent>
            {loading && (
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  Cargando actividades…
                </Typography>
              </Stack>
            )}

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: { xs: 0.35, sm: 0.5 }, mb: 1 }}>
              {WEEKDAYS.map((d) => (
                <Typography
                  key={d}
                  variant="caption"
                  fontWeight={700}
                  color="text.secondary"
                  py={1}
                  sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' }, textAlign: 'center' }}
                >
                  <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{d}</Box>
                  <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>{d.slice(0, 3)}</Box>
                </Typography>
              ))}
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: { xs: 0.35, sm: 0.5 }, overflow: 'hidden' }}>
              {cells.map((cell) => {
                const dayItems = cell.date ? byDate[cell.date] || [] : [];
                const style = cell.inMonth ? dayPriorityStyle(dayItems) : undefined;

                return (
                  <Button
                    key={cell.key}
                    disabled={!cell.date}
                    onClick={() => cell.date && setSelectedDay(cell.date)}
                    sx={{
                      minHeight: { xs: 52, sm: 72 },
                      minWidth: 0,
                      p: { xs: 0.4, sm: 0.75 },
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      justifyContent: 'flex-start',
                      textTransform: 'none',
                      borderRadius: 1.5,
                      border: 1,
                      borderColor: cell.isToday ? 'primary.main' : 'divider',
                      opacity: cell.inMonth ? 1 : 0.4,
                      bgcolor: 'background.paper',
                      color: 'text.primary',
                      overflow: 'hidden',
                      ...style,
                    }}
                  >
                    <Typography
                      variant="caption"
                      fontWeight={cell.isToday ? 700 : 400}
                      color="inherit"
                      sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' }, lineHeight: 1.2 }}
                    >
                      {cell.day}
                    </Typography>
                    {cell.inMonth && dayItems.length > 0 && (
                      <Stack spacing={0.25} width="100%" mt={0.25} sx={{ minWidth: 0 }}>
                        {dayItems.slice(0, 2).map((a) => (
                          <Typography
                            key={a.id}
                            variant="caption"
                            noWrap
                            color="inherit"
                            sx={{
                              fontSize: { xs: '0.58rem', sm: '0.7rem' },
                              maxWidth: '100%',
                              textDecoration: a.estado === 'COMPLETADA' ? 'line-through' : 'none',
                              opacity: a.estado === 'COMPLETADA' ? 0.7 : 1,
                            }}
                          >
                            {a.titulo}
                          </Typography>
                        ))}
                        {dayItems.length > 2 && (
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: { xs: '0.55rem', sm: '0.65rem' } }}>
                            +{dayItems.length - 2}
                          </Typography>
                        )}
                      </Stack>
                    )}
                  </Button>
                );
              })}
            </Box>

            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, textAlign: 'center', display: 'block' }}>
              Click en un día para ver actividades
            </Typography>
          </CardContent>
        </Card>
      ) : (
        <Card sx={glassSurface(theme, { strong: true })}>
          <CardContent>
            {loading && (
              <Stack direction="row" alignItems="center" spacing={1} mb={2}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  Cargando actividades…
                </Typography>
              </Stack>
            )}
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
              {YEAR_MONTHS.map((m) => {
                const count = monthActivityCount(m);
                const isCurrent = m === today.getMonth() + 1 && year === today.getFullYear();
                return (
                  <Button
                    key={m}
                    onClick={() => { setMonth(m); setView('month'); }}
                    sx={{
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      textTransform: 'none',
                      borderRadius: 2,
                      border: 1,
                      borderColor: isCurrent ? 'primary.main' : 'divider',
                      bgcolor: 'background.paper',
                      color: 'text.primary',
                      p: 1.5,
                      minHeight: 80,
                      '&:hover': { borderColor: 'primary.main', bgcolor: 'action.hover' },
                    }}
                  >
                    <Typography variant="subtitle2" fontWeight={700}>
                      {MONTHS_SHORT[m - 1]}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {count} actividad{count === 1 ? '' : 'es'}
                    </Typography>
                  </Button>
                );
              })}
            </Box>
          </CardContent>
        </Card>
      )}

      {selectedDay && (
        <DayActivitiesModal
          fecha={selectedDay}
          onClose={() => setSelectedDay(null)}
          onChanged={loadMonth}
        />
      )}
    </PageStack>
  );
}
