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
import { isTempEntityId, readApiGet } from '../offline/cache';
import ActivityDetailModal from '../components/ActivityDetailModal';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import { glassChip, glassField, glassSurface } from '../theme/glass';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import type { ActividadListItem } from '../types/activity';
import { ACTIVITY_STATES, estadoLabel, formatDate, tipoLabel } from '../types/activity';
import { localDateIso, shiftLocalDateIso } from '../utils/localDate';

type DateFilter = 'ALL' | 'TODAY' | 'TOMORROW' | 'WEEK';
type SortKey = 'titulo' | 'fecha';
type SortDir = 'asc' | 'desc';

function todayIso() {
  return localDateIso();
}

function tomorrowIso() {
  return shiftLocalDateIso(localDateIso(), 1);
}

function weekEndIso() {
  return shiftLocalDateIso(localDateIso(), 7);
}

function estadoChipColor(estado: string): 'default' | 'success' | 'warning' {
  if (estado === 'COMPLETADA') return 'success';
  return 'warning';
}

export default function ActivitiesPage() {
  const theme = useTheme();
  const location = useLocation();
  const [items, setItems] = useState<ActividadListItem[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'PENDIENTE' | 'COMPLETADA'>('ALL');
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
    // Load from cache first for instant UI
    const cached = readApiGet<ActividadListItem[]>('/api/v1/activities');
    if (cached) {
      setItems(cached);
      setLoading(false);
    }
    // Then fetch from server in background
    const res = await api.activities.list();
    if (!res.ok || !res.data) {
      if (!cached) {
        setError(res.error || 'No se pudieron cargar las actividades');
        setItems([]);
      }
    } else {
      setItems(res.data);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onQueue = () => load();
    window.addEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, onQueue);    };
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
      const aDone = a.estado === 'COMPLETADA' ? 1 : 0;
      const bDone = b.estado === 'COMPLETADA' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
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

  const pendingItems = useMemo(
    () => filtered.filter((a) => a.estado !== 'COMPLETADA'),
    [filtered],
  );
  const completedItems = useMemo(
    () => filtered.filter((a) => a.estado === 'COMPLETADA'),
    [filtered],
  );

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

      <Stack
        direction="row"
        flexWrap="nowrap"
        gap={1}
        sx={{ overflowX: 'auto', pb: 0.5, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
      >
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

      <Stack
        direction="row"
        flexWrap="nowrap"
        gap={1}
        sx={{ overflowX: 'auto', pb: 0.5, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}
      >
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
        <Stack spacing={3}>
          {pendingItems.length > 0 && (
            <Stack spacing={2}>
              {filter === 'ALL' && completedItems.length > 0 && (
                <Typography variant="subtitle2" color="text.secondary" fontWeight={700} letterSpacing={0.4}>
                  Pendientes ({pendingItems.length})
                </Typography>
              )}
              {pendingItems.map((a) => (
                <ActivityCard
                  key={a.id}
                  item={a}
                  busyId={busyId}
                  onOpen={() => setDetailId(a.id)}
                  onComplete={() => changeStatus(a.id, 'COMPLETADA')}
                />
              ))}
            </Stack>
          )}

          {completedItems.length > 0 && (
            <Stack spacing={2}>
              {filter === 'ALL' && (
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  fontWeight={700}
                  letterSpacing={0.4}
                  sx={{ pt: pendingItems.length > 0 ? 1 : 0, borderTop: pendingItems.length > 0 ? 1 : 0, borderColor: 'divider' }}
                >
                  Completadas ({completedItems.length})
                </Typography>
              )}
              {completedItems.map((a) => (
                <ActivityCard
                  key={a.id}
                  item={a}
                  busyId={busyId}
                  onOpen={() => setDetailId(a.id)}
                  onComplete={() => changeStatus(a.id, 'COMPLETADA')}
                />
              ))}
            </Stack>
          )}
        </Stack>
      )}

      <ActivityDetailModal activityId={detailId} onClose={() => setDetailId(null)} onChanged={load} />
    </PageStack>
  );
}

function ActivityCard({
  item: a,
  busyId,
  onOpen,
  onComplete,
}: {
  item: ActividadListItem;
  busyId: number | null;
  onOpen: () => void;
  onComplete: () => void;
}) {
  return (
    <Card variant="outlined" sx={{ opacity: a.estado === 'COMPLETADA' ? 0.78 : 1 }}>
      <CardContent
        component="button"
        onClick={onOpen}
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
        <Stack direction="row" spacing={1} alignItems="flex-start" flexWrap="wrap" useFlexGap>
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
            <Typography
              fontWeight={600}
              color="text.primary"
              sx={{ textDecoration: a.estado === 'COMPLETADA' ? 'line-through' : 'none' }}
            >
              {a.titulo}
            </Typography>
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
          <Button size="small" disabled={busyId === a.id} onClick={onComplete}>
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
  );
}
