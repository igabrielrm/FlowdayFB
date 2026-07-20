import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { api } from '../api/client';
import { readApiGet } from '../offline/cache';
import { modalSlotProps } from '../theme/modal';
import type { ActividadDetail, ActividadListItem } from '../types/activity';
import { estadoLabel, formatDate, tipoLabel } from '../types/activity';
import { resolveActivityDetailState } from './activityDetailState';

type Props = {
  activityId: number | null;
  onClose: () => void;
  onChanged?: () => void;
};

function estadoChipColor(estado: string): 'default' | 'success' | 'warning' | 'info' {
  if (estado === 'COMPLETADA') return 'success';
  if (estado === 'EN_PROCESO') return 'info';
  if (estado === 'REAGENDADA') return 'warning';
  return 'default';
}

function readCachedActivityDetail(id: number | null): ActividadDetail | null {
  if (!id) return null;
  const direct = readApiGet<ActividadDetail>(`/api/v1/activities/${id}`);
  if (direct) return direct;

  const listItem = readApiGet<ActividadListItem[]>('/api/v1/activities')?.find((activity) => String(activity.id) === String(id));
  if (!listItem) return null;

  return {
    id: listItem.id,
    titulo: listItem.titulo,
    tipo: listItem.tipo,
    estado: listItem.estado,
    fechaInicio: listItem.fechaInicio,
    horaInicio: listItem.horaInicio,
    duracionMinutos: listItem.duracionMinutos,
    materia: listItem.materia,
    prioridad: listItem.prioridad,
    color: listItem.color,
    esPropietario: listItem.esPropietario,
    puedeEditar: listItem.esPropietario,
    companerosIds: [],
  };
}

export default function ActivityDetailModal({ activityId, onClose, onChanged }: Props) {
  const navigate = useNavigate();
  const theme = useTheme();
  const [detail, setDetail] = useState<ActividadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activityId) {
      setDetail(null);
      setLoading(false);
      setError(null);
      return;
    }

    const cachedDetail = readCachedActivityDetail(activityId);
    if (cachedDetail) {
      setDetail(cachedDetail);
      setLoading(false);
    } else {
      setDetail(null);
      setLoading(true);
    }
    setError(null);

    void api.activities.get(activityId).then((res) => {
      const nextState = resolveActivityDetailState(res, cachedDetail);
      setDetail(nextState.detail);
      setError(nextState.error);
      setLoading(nextState.loading);
    });
  }, [activityId]);

  async function complete() {
    if (!activityId) return;
    setBusy(true);
    const res = await api.activities.updateStatus(activityId, 'COMPLETADA');
    if (!res.ok) setError(res.error || 'No se pudo completar');
    else {
      onChanged?.();
      onClose();
    }
    setBusy(false);
  }

  return (
    <Dialog open={!!activityId} onClose={onClose} maxWidth="sm" fullWidth slotProps={modalSlotProps(theme)}>
      <DialogTitle sx={{ pr: 6, pb: 1 }}>
        <IconButton
          aria-label="Cerrar"
          onClick={onClose}
          sx={{ position: 'absolute', right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ pt: 1 }}>
        {loading ? (
          <Typography color="text.secondary">Cargando…</Typography>
        ) : error ? (
          <Alert severity="error">{error}</Alert>
        ) : detail ? (
          <Stack spacing={2.5}>
            <Box>
              <Stack direction="row" spacing={1} alignItems="center" mb={1}>
                <Box
                  sx={{
                    width: 12,
                    height: 12,
                    borderRadius: '50%',
                    bgcolor: detail.color || '#5082ef',
                  }}
                />
                <Typography variant="overline" color="text.secondary" letterSpacing={1}>
                  {tipoLabel(detail.tipo)}
                </Typography>
              </Stack>
              <Typography variant="h5" fontWeight={700} lineHeight={1.3}>
                {detail.titulo}
              </Typography>
              <Chip
                label={estadoLabel(detail.estado)}
                size="small"
                color={estadoChipColor(detail.estado)}
                sx={{ mt: 1.5 }}
              />
            </Box>

            <Divider />

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr 1fr', sm: '1fr 1fr' },
                gap: { xs: 2.5, sm: 2 },
                rowGap: { xs: 2.75, sm: 2.5 },
              }}
            >
              {[
                { label: 'Fecha', value: formatDate(detail.fechaInicio) },
                { label: 'Hora', value: detail.horaInicio?.slice(0, 5) || '—' },
                { label: 'Prioridad', value: detail.prioridad || '—' },
                { label: 'Materia', value: detail.materia?.trim() || '—' },
              ].map((row) => (
                <Box key={row.label} sx={{ minWidth: 0 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    display="block"
                    mb={0.75}
                    sx={{ letterSpacing: 0.3, textTransform: 'uppercase', fontSize: '0.7rem' }}
                  >
                    {row.label}
                  </Typography>
                  <Typography variant="body1" fontWeight={600} sx={{ wordBreak: 'break-word' }}>
                    {row.value}
                  </Typography>
                </Box>
              ))}
            </Box>

            {detail.descripcion && (
              <>
                <Divider />
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    Descripción
                  </Typography>
                  <Typography variant="body2">{detail.descripcion}</Typography>
                </Box>
              </>
            )}

          </Stack>
        ) : null}
      </DialogContent>

      {detail && (
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          {detail.estado !== 'COMPLETADA' && (
            <Button variant="contained" disabled={busy} onClick={complete}>
              Finalizar
            </Button>
          )}
          {detail.puedeEditar && (
            <Button
              disabled={busy}
              onClick={() => {
                onClose();
                navigate(`/activities/${detail.id}/edit`);
              }}
            >
              Editar
            </Button>
          )}
        </DialogActions>
      )}
    </Dialog>
  );
}
