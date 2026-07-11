import { Link as RouterLink, useLocation } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  CircularProgress,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import { api } from '../api/client';
import { OFFLINE_QUEUE_EVENT } from '../events';
import { isTempEntityId } from '../offline/cache';
import ActivityDetailModal from '../components/ActivityDetailModal';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import { glassChip, glassField, glassSurface } from '../theme/glass';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { ActividadListItem } from '../types/activity';
import { ACTIVITY_STATES, estadoLabel, formatDate, tipoLabel } from '../types/activity';

type DateFilter = 'ALL' | 'TODAY' | 'TOMORROW' | 'WEEK';
type SortKey = 'titulo' | 'fecha';
type SortDir = 'asc' | 'desc';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowIso() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function weekEndIso() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function estadoChipColor(estado: string): 'default' | 'success' | 'warning' | 'info' {
  if (estado === 'COMPLETADA') return 'success';
  if (estado === 'EN_PROCESO') return 'info';
  return 'warning';
}

export default function ActivitiesPage() {
  const theme = useTheme();
  const location = useLocation();
  const [items, setItems] = useState<ActividadListItem[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDIENTE' | 'EN_PROCESO' | 'COMPLETADA'>('ALL');
  const [dateFilter, setDateFilter] = useState<DateFilter>('ALL');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search);
  const [sortKey, setSortKey] = useState<SortKey>('fecha');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [draftNotice, setDraftNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await api.activities.list();
    if (!res.ok || !res.data) {
      setError(res.error || 'No se pudieron cargar las actividades');
      setItems([]);
    } else {
      setItems(res.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onQueue = () => load();
    window.addEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    return () => window.removeEventListener(OFFLINE_QUEUE_EVENT, onQueue);
  }, [load]);

  useEffect(() => {
    const state = location.state as { draftSaved?: boolean } | null;
    if (state?.draftSaved) {
      setDraftNotice('Actividad guardada como borrador. Se sincronizará al reconectar.');
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const stats = useMemo(() => {
    const pendientes = items.filter((a) => a.estado !== 'COMPLETADA').length;
    const completadas = items.filter((a) => a.estado === 'COMPLETADA').length;
    return { total: items.length, pendientes, completadas };
  }, [items]);

  const filtered = useMemo(() => {
    let list = [...items];
    if (filter !== 'ALL') list = list.filter((a) => a.estado === filter);
    if (dateFilter === 'TODAY') list = list.filter((a) => a.fechaInicio === todayIso());
    else if (dateFilter === 'TOMORROW') list = list.filter((a) => a.fechaInicio === tomorrowIso());
    else if (dateFilter === 'WEEK') {
      const end = weekEndIso();
      const start = todayIso();
      list = list.filter((a) => a.fechaInicio && a.fechaInicio >= start && a.fechaInicio <= end);
    }
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.titulo.toLowerCase().includes(q) ||
          (a.materia && a.materia.toLowerCase().includes(q)) ||
          tipoLabel(a.tipo).toLowerCase().includes(q),
      );
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'titulo') cmp = a.titulo.localeCompare(b.titulo, 'es');
      else {
        const fa = a.fechaInicio || '';
        const fb = b.fechaInicio || '';
        cmp = fa.localeCompare(fb);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [items, filter, dateFilter, debouncedSearch, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  async function changeStatus(id: number, estado: string) {
    setBusyId(id);
    const res = await api.activities.updateStatus(id, estado);
    if (!res.ok) setError(res.error || 'No se pudo actualizar');
    else await load();
    setBusyId(null);
  }

  return (
    <PageStack>
      <PageHeader
        title="Actividades"
        subtitle={`${filtered.length} en vista`}
        actions={
          <Button component={RouterLink} to="/activities/new" variant="contained">
            + Nueva
          </Button>
        }
      />

      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
        {[
          { label: 'Total', value: stats.total },
          { label: 'Pendientes', value: stats.pendientes },
          { label: 'Completadas', value: stats.completadas },
        ].map((s) => (
          <Card key={s.label} sx={{ flex: '1 1 100px', minWidth: 100, ...glassSurface(theme, { strong: true }) }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                {s.label}
              </Typography>
              <Typography variant="h5" fontWeight={700}>
                {s.value}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Stack direction="row" flexWrap="wrap" gap={1}>
        {(['ALL', 'TODAY', 'TOMORROW', 'WEEK'] as DateFilter[]).map((v) => (
          <Chip
            key={v}
            label={
              v === 'ALL' ? 'Todas' : v === 'TODAY' ? 'Hoy' : v === 'TOMORROW' ? 'Mañana' : 'Esta semana'
            }
            onClick={() => setDateFilter(v)}
            sx={glassChip(theme, dateFilter === v)}
          />
        ))}
      </Stack>

      <Stack direction="row" flexWrap="wrap" gap={1}>
        {(['ALL', ...ACTIVITY_STATES.map((s) => s.value)] as const).map((value) => (
          <Chip
            key={value}
            label={value === 'ALL' ? 'Todos estados' : estadoLabel(value)}
            onClick={() => setFilter(value as typeof filter)}
            sx={glassChip(theme, filter === value)}
          />
        ))}
      </Stack>

      <TextField
        placeholder="Buscar por título, materia o tipo…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        fullWidth
        size="small"
        sx={glassField(theme)}
      />

      <Stack direction="row" spacing={1}>
        <Button size="small" onClick={() => toggleSort('titulo')} sx={glassChip(theme, sortKey === 'titulo')}>
          Nombre {sortKey === 'titulo' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </Button>
        <Button size="small" onClick={() => toggleSort('fecha')} sx={glassChip(theme, sortKey === 'fecha')}>
          Fecha {sortKey === 'fecha' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
        </Button>
      </Stack>

      {draftNotice && (
        <Alert severity="info" onClose={() => setDraftNotice(null)}>
          {draftNotice}
        </Alert>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {loading ? (
        <Stack alignItems="center" py={4}>
          <CircularProgress size={32} />
        </Stack>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent sx={{ textAlign: 'center', py: 4 }}>
            <Typography color="text.secondary" gutterBottom>
              No hay actividades en este filtro.
            </Typography>
            <Button component={RouterLink} to="/activities/new" variant="contained">
              Crear la primera
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Stack spacing={2}>
          {filtered.map((a) => (
            <Card key={a.id} variant="outlined">
              <CardContent
                component="button"
                onClick={() => setDetailId(a.id)}
                sx={{
                  width: '100%',
                  textAlign: 'left',
                  border: 'none',
                  bgcolor: 'transparent',
                  cursor: 'pointer',
                  p: 2,
                  color: 'text.primary',
                  '&:hover': { bgcolor: 'action.hover' },
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="flex-start">
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: a.color || '#5082ef',
                      mt: 0.75,
                      flexShrink: 0,
                    }}
                  />
                  <Box flex={1}>
                    <Typography fontWeight={600} color="text.primary">{a.titulo}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      {tipoLabel(a.tipo)}
                      {a.materia ? ` · ${a.materia}` : ''}
                      {a.fechaInicio ? ` · ${formatDate(a.fechaInicio)}` : ''}
                    </Typography>
                  </Box>
                  <Chip label={estadoLabel(a.estado)} size="small" color={estadoChipColor(a.estado)} />
                  {isTempEntityId(a.id) && (
                    <Chip label="Borrador" size="small" color="default" variant="outlined" />
                  )}
                </Stack>
              </CardContent>
              <CardActions>
                {a.estado !== 'COMPLETADA' && (
                  <Button
                    size="small"
                    disabled={busyId === a.id}
                    onClick={() => changeStatus(a.id, 'COMPLETADA')}
                  >
                    Completar
                  </Button>
                )}
                {a.esPropietario && (
                  <Button size="small" component={RouterLink} to={`/activities/${a.id}/edit`}>
                    Editar
                  </Button>
                )}
              </CardActions>
            </Card>
          ))}
        </Stack>
      )}

      <ActivityDetailModal activityId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
    </PageStack>
  );
}
