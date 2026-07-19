import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { api } from '../api/client';
import { modalSlotProps } from '../theme/modal';
import ActivityDetailModal from './ActivityDetailModal';
import type { ActividadListItem } from '../types/activity';
import { estadoLabel, formatDate, tipoLabel } from '../types/activity';

type Props = {
  fecha: string;
  onClose: () => void;
  onChanged: () => void;
};

export default function DayActivitiesModal({ fecha, onClose, onChanged }: Props) {
  const theme = useTheme();
  const [items, setItems] = useState<ActividadListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    api.activities.byDate(fecha).then((res) => {
      if (res.ok && res.data) setItems(res.data);
      else setError(res.error || 'No se pudieron cargar las actividades');
      setLoading(false);
    });
  }, [fecha]);

  async function complete(id: number) {
    setBusyId(id);
    const res = await api.activities.updateStatus(id, 'COMPLETADA');
    if (!res.ok) {
      setError(res.error || 'No se pudo completar');
    } else {
      const dayRes = await api.activities.byDate(fecha);
      if (dayRes.ok && dayRes.data) setItems(dayRes.data);
      onChanged();
    }
    setBusyId(null);
  }

  return (
    <>
      <Dialog open onClose={onClose} maxWidth="sm" fullWidth slotProps={modalSlotProps(theme)}>
        <DialogTitle sx={{ pr: 6 }}>
          Actividades — {formatDate(fecha)}
          <IconButton
            aria-label="Cerrar"
            onClick={onClose}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          {loading ? (
            <Typography color="text.secondary">Cargando…</Typography>
          ) : items.length === 0 ? (
            <Typography color="text.secondary">No hay actividades este día.</Typography>
          ) : (
            <List disablePadding>
              {items.map((a) => (
                <ListItem
                  key={a.id}
                  disablePadding
                  sx={{ flexDirection: 'column', alignItems: 'stretch', mb: 1 }}
                >
                  <ListItemButton onClick={() => setDetailId(a.id)} sx={{ borderRadius: 2, border: 1, borderColor: 'divider' }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        bgcolor: a.color || '#5082ef',
                        mr: 1.5,
                        flexShrink: 0,
                        mt: 0.75,
                      }}
                    />
                    <ListItemText
                      primary={a.titulo}
                      secondary={`${a.horaInicio ? a.horaInicio.slice(0, 5) : 'Sin hora'} · ${tipoLabel(a.tipo)}`}
                    />
                    <Chip label={estadoLabel(a.estado)} size="small" />
                  </ListItemButton>
                  {a.estado !== 'COMPLETADA' && (
                    <Button
                      size="small"
                      sx={{ alignSelf: 'flex-end', mt: 0.5 }}
                      disabled={busyId === a.id}
                      onClick={() => complete(a.id)}
                    >
                      Completar
                    </Button>
                  )}
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <Button component={RouterLink} to={`/activities/new?fecha=${fecha}`} variant="contained">
            + Nueva
          </Button>
        </DialogActions>
      </Dialog>

      <ActivityDetailModal
        activityId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={onChanged}
      />
    </>
  );
}
