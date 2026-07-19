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
  groupByDate,
  monthLabel,
} from '../types/calendar';


export default function CalendarPage() {
  const theme = useTheme();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [activities, setActivities] = useState<ActividadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  const loadMonth = useCallback(async () => {
    setLoading(true);
    const res = await api.activities.byMonth(year, month);
    if (res.ok && res.data) setActivities(res.data);
    setLoading(false);
  }, [month, year]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  const byDate = useMemo(() => groupByDate(activities), [activities]);
  const cells = useMemo(() => buildMonthGrid(year, month), [month, year]);

  function goPrev() {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  }

  function goNext() {
    if (month === 12) {
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

  return (
    <PageStack>
      <PageHeader
        title="Calendario"
        subtitle="Vista mensual de tus actividades"
        actions={
          <Stack direction="row" spacing={0.75}>
            <IconButton size="small" onClick={goPrev} sx={glassButton(theme)}>
              <ChevronLeftIcon fontSize="small" />
            </IconButton>
            <Button
              size="small"
              onClick={goToday}
              disabled={isCurrentMonth}
              sx={{
                ...glassButton(theme),
                minWidth: 120,
                borderRadius: 2.5,
                px: 2,
              }}
            >
              {monthLabel(year, month)}
            </Button>
            <IconButton size="small" onClick={goNext} sx={glassButton(theme)}>
              <ChevronRightIcon fontSize="small" />
            </IconButton>
          </Stack>
        }
      />

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
                textAlign="center"
                color="text.secondary"
                py={1}
                sx={{ fontSize: { xs: '0.65rem', sm: '0.75rem' } }}
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
