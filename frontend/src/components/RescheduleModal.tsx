import { FormEvent, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  useTheme,
} from '@mui/material';
import { api } from '../api/client';
import { modalSlotProps } from '../theme/modal';
import type { ReschedulableItem } from '../types/activity';

type Props = {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
};

export default function RescheduleModal({ open, onClose, onDone }: Props) {
  const theme = useTheme();
  const [items, setItems] = useState<ReschedulableItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [fecha, setFecha] = useState('');
  const [hora, setHora] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.activities.reschedulable().then((res) => {
      if (res.ok && res.data) setItems(res.data);
    });
  }, [open]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!selectedId || !fecha) {
      setError('Selecciona un evento y una fecha');
      return;
    }
    setSubmitting(true);
    setError(null);
    const res = await api.activities.reschedule(Number(selectedId), fecha, hora || undefined);
    if (!res.ok) setError(res.error || 'No se pudo reagendar');
    else {
      onDone?.();
      onClose();
    }
    setSubmitting(false);
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth slotProps={modalSlotProps(theme)}>
      <DialogTitle>Reagendar reunión o cita</DialogTitle>
      <form onSubmit={submit}>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <FormControl fullWidth required>
              <InputLabel id="reschedule-event-label">Evento</InputLabel>
              <Select
                labelId="reschedule-event-label"
                label="Evento"
                value={selectedId !== '' && !isNaN(Number(selectedId)) ? selectedId : ''}
                onChange={(e) => setSelectedId(e.target.value ? Number(e.target.value) : '')}
              >
                <MenuItem value="">Selecciona…</MenuItem>
                {items.map((item) => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.etiqueta || item.titulo}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Nueva fecha"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <TextField
              label="Nueva hora"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Guardando…' : 'Confirmar'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
