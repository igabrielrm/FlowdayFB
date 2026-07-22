import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { api } from '../api/client';
import { OFFLINE_QUEUE_EVENT } from '../events';
import ScheduleBlockModal, { ScheduleModalState } from '../components/ScheduleBlockModal';
import ScheduleGrid from '../components/ScheduleGrid';
import PageHeader from '../components/mui/PageHeader';
import PageStack from '../components/mui/PageStack';
import type { CreateScheduleBlockPayload, ScheduleAlert, ScheduleBlock } from '../types/schedule';
import { GRID_END, GRID_START } from '../types/schedule';

export default function SchedulePage() {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [alert, setAlert] = useState<ScheduleAlert | null>(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ScheduleModalState>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [blocksRes, alertRes] = await Promise.all([
      api.schedule.list(),
      api.schedule.alert(),
    ]);
    if (blocksRes.ok && blocksRes.data) setBlocks(blocksRes.data);
    else setPageError(blocksRes.error || 'No se pudo cargar el horario');
    if (alertRes.ok) setAlert(alertRes.data as ScheduleAlert | null);
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  useEffect(() => {
    const onQueue = () => reload();
    window.addEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    };
  }, [reload]);

  async function handleSave(payload: CreateScheduleBlockPayload, id?: number) {
    setBusy(true);
    setModalError(null);
    const res = id ? await api.schedule.update(id, payload) : await api.schedule.create(payload);
    if (!res.ok) {
      setModalError(res.error || 'No se pudo guardar');
      setBusy(false);
      return;
    }
    setModal(null);
    setBusy(false);
    await reload();
  }

  async function handleDelete(id: number) {
    if (!confirm('¿Eliminar esta materia del horario?')) return;
    setBusy(true);
    setModalError(null);
    const res = await api.schedule.remove(id);
    if (!res.ok) {
      setModalError(res.error || 'No se pudo eliminar');
      setBusy(false);
      return;
    }
    setModal(null);
    setBusy(false);
    await reload();
  }

  return (
    <PageStack>
      <PageHeader
        title="Horario"
        subtitle="Toca un día o una celda vacía para agregar una clase"
        actions={
          <Button variant="contained" onClick={() => setModal({ mode: 'create' })}>
            + Agregar materia
          </Button>
        }
      />

      {pageError && <Alert severity="error">{pageError}</Alert>}

      {alert && (
        <Card>
          <CardContent>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography fontSize={28}>{alert.enCurso ? '📚' : '⏰'}</Typography>
              <Box>
                <Typography fontWeight={700}>{alert.materia}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {alert.mensaje}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Stack alignItems="center" py={4}>
          <CircularProgress />
        </Stack>
      ) : (
        <Card sx={{ overflow: 'hidden' }}>
          <ScheduleGrid
            blocks={blocks}
            gridStart={GRID_START}
            gridEnd={GRID_END}
            onCellClick={(diaSemana, hora) => setModal({ mode: 'create', diaSemana, horaInicio: hora })}
            onBlockClick={(block) => setModal({ mode: 'edit', block })}
          />
          <Stack
            direction="row"
            sx={{ flexWrap: 'wrap', gap: 3, px: 2.5, py: 2, borderTop: 1, borderColor: 'divider' }}
            alignItems="center"
          >
            <Typography variant="caption" color="text.secondary">
              Columna resaltada = hoy
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Línea roja = hora actual
            </Typography>
          </Stack>
          {blocks.length === 0 && (
            <Typography variant="body2" color="text.secondary" textAlign="center" pb={2}>
              Sin clases aún — haz clic en cualquier hora del calendario para empezar.
            </Typography>
          )}
        </Card>
      )}

      <ScheduleBlockModal
        open={modal}
        existingBlocks={blocks}
        busy={busy}
        error={modalError}
        onClose={() => {
          setModal(null);
          setModalError(null);
        }}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </PageStack>
  );
}
