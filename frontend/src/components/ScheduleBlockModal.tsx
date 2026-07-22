import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import type { CreateScheduleBlockPayload, ScheduleBlock } from '../types/schedule';
import { DAY_OPTIONS, sumarHora } from '../types/schedule';
import { ACTIVITY_COLORS } from '../types/activity';
import ColorSwatchPicker from './ColorSwatchPicker';
import { modalSlotProps } from '../theme/modal';

type OpenState =
  | { mode: 'create'; diaSemana?: number; horaInicio?: string }
  | { mode: 'edit'; block: ScheduleBlock }
  | null;

type Props = {
  open: OpenState;
  existingBlocks: ScheduleBlock[];
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (payload: CreateScheduleBlockPayload, id?: number) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
};

type CreateTab = 'choice' | 'new' | 'existing';

export default function ScheduleBlockModal({
  open,
  existingBlocks,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const theme = useTheme();
  const [tab, setTab] = useState<CreateTab>('choice');
  const [materia, setMateria] = useState('');
  const [diaSemana, setDiaSemana] = useState(1);
  const [horaInicio, setHoraInicio] = useState('08:00');
  const [horaFin, setHoraFin] = useState('10:00');
  const [aula, setAula] = useState('');
  const [profesor, setProfesor] = useState('');
  const [color, setColor] = useState('#5082ef');
  const [selectedMateriaKey, setSelectedMateriaKey] = useState('');

  const materiaCatalog = useMemo(() => {
    const map = new Map<string, ScheduleBlock>();
    for (const b of existingBlocks) {
      const key = b.materia.trim().toLowerCase();
      if (!map.has(key)) map.set(key, b);
    }
    return Array.from(map.values()).sort((a, b) => a.materia.localeCompare(b.materia));
  }, [existingBlocks]);

  useEffect(() => {
    if (!open) {
      setTab('choice');
      return;
    }
    if (open.mode === 'edit') {
      const b = open.block;
      setTab('new');
      setMateria(b.materia);
      setDiaSemana(b.diaSemana);
      setHoraInicio(b.horaInicio);
      setHoraFin(b.horaFin);
      setAula(b.aula || '');
      setProfesor(b.profesor || '');
      setColor(b.color || '#5082ef');
    } else {
      setTab(open.diaSemana != null || open.horaInicio ? 'choice' : 'new');
      setMateria('');
      setDiaSemana(open.diaSemana || 1);
      setHoraInicio(open.horaInicio || '08:00');
      setHoraFin(open.horaInicio ? sumarHora(open.horaInicio, 2) : '10:00');
      setAula('');
      setProfesor('');
      setColor('#5082ef');
      setSelectedMateriaKey('');
    }
  }, [open]);

  const isEdit = open?.mode === 'edit';
  const editId = isEdit && open.mode === 'edit' ? open.block.id : undefined;
  const fromSlot = open?.mode === 'create' && (open.diaSemana != null || open.horaInicio);

  function applyExistingMateria(key: string) {
    setSelectedMateriaKey(key);
    const template = materiaCatalog.find((b) => b.materia.trim().toLowerCase() === key);
    if (!template) return;
    setMateria(template.materia);
    setAula(template.aula || '');
    setProfesor(template.profesor || '');
    setColor(template.color || '#5082ef');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await onSave(
      {
        materia: materia.trim(),
        diaSemana,
        horaInicio,
        horaFin,
        aula: aula.trim() || undefined,
        profesor: profesor.trim() || undefined,
        color,
      },
      editId,
    );
  }

  const title = isEdit ? 'Editar clase' : fromSlot ? 'Asignar horario' : 'Agregar clase';

  return (
    <Dialog open={!!open} onClose={onClose} maxWidth="sm" fullWidth scroll="paper" slotProps={modalSlotProps(theme)}>
      <DialogTitle>
        {title}
        {fromSlot && tab === 'choice' && (
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            ¿Cómo quieres llenar este espacio?
          </Typography>
        )}
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {!isEdit && tab === 'choice' && (
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <Card variant="outlined" sx={{ flex: 1 }}>
              <CardActionArea onClick={() => setTab('new')} sx={{ p: 2, height: '100%' }}>
                <Typography fontSize={28}>✏️</Typography>
                <Typography fontWeight={700} mt={1}>
                  Nueva clase
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Crear materia desde cero
                </Typography>
              </CardActionArea>
            </Card>
            <Card variant="outlined" sx={{ flex: 1, opacity: materiaCatalog.length === 0 ? 0.5 : 1 }}>
              <CardActionArea
                disabled={materiaCatalog.length === 0}
                onClick={() => setTab('existing')}
                sx={{ p: 2, height: '100%' }}
              >
                <Typography fontSize={28}>📚</Typography>
                <Typography fontWeight={700} mt={1}>
                  Clase existente
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {materiaCatalog.length > 0
                    ? 'Elegir del registro'
                    : 'Aún no tienes materias guardadas'}
                </Typography>
              </CardActionArea>
            </Card>
          </Stack>
        )}

        {(isEdit || tab === 'new' || tab === 'existing') && (
          <Stack component="form" spacing={2} onSubmit={onSubmit}>
            {!isEdit && tab !== 'choice' && fromSlot && (
              <Button size="small" onClick={() => setTab('choice')} sx={{ alignSelf: 'flex-start' }}>
                ← Volver a opciones
              </Button>
            )}

            {tab === 'existing' && (
              <FormControl fullWidth required>
                <InputLabel>Materia registrada</InputLabel>
                <Select
                  label="Materia registrada"
                  value={selectedMateriaKey}
                  onChange={(e) => applyExistingMateria(e.target.value)}
                >
                  <MenuItem value="">Selecciona una materia…</MenuItem>
                  {materiaCatalog.map((b) => {
                    const key = b.materia.trim().toLowerCase();
                    return (
                      <MenuItem key={key} value={key}>
                        {b.materia}
                        {b.profesor ? ` · ${b.profesor}` : ''}
                      </MenuItem>
                    );
                  })}
                </Select>
              </FormControl>
            )}

            {(tab === 'new' || isEdit) && (
              <TextField
                label="Materia"
                value={materia}
                onChange={(e) => setMateria(e.target.value)}
                required
              />
            )}

            {tab === 'existing' && materia && (
              <Typography variant="body2" color="text.secondary">
                Asignando <strong>{materia}</strong> al horario seleccionado.
              </Typography>
            )}

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormControl fullWidth>
                <InputLabel>Día</InputLabel>
                <Select
                  label="Día"
                  value={diaSemana}
                  onChange={(e) => setDiaSemana(Number(e.target.value))}
                >
                  {DAY_OPTIONS.map((d) => (
                    <MenuItem key={d.value} value={d.value}>
                      {d.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Hora inicio"
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                required
                slotProps={{ inputLabel: { shrink: true } }}
                fullWidth
              />
            </Stack>

            <TextField
              label="Hora fin"
              type="time"
              value={horaFin}
              onChange={(e) => setHoraFin(e.target.value)}
              required
              slotProps={{ inputLabel: { shrink: true } }}
            />

            <ColorSwatchPicker
              value={color}
              onChange={setColor}
              colors={ACTIVITY_COLORS}
              legend="Color de la clase"
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField
                label="Aula / lugar"
                value={aula}
                onChange={(e) => setAula(e.target.value)}
                placeholder="Ej: Lab. 204"
                fullWidth
              />
              <TextField
                label="Profesor"
                value={profesor}
                onChange={(e) => setProfesor(e.target.value)}
                fullWidth
              />
            </Stack>

            <Stack direction="row" justifyContent="space-between" alignItems="center" pt={1}>
              {isEdit && open.mode === 'edit' && (
                <Button color="error" disabled={busy} onClick={() => onDelete(open.block.id)}>
                  Eliminar
                </Button>
              )}
              <Box ml="auto">
                <Button onClick={onClose} sx={{ mr: 1 }}>
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={busy || (tab === 'existing' && !materia)}
                >
                  {busy ? 'Guardando…' : 'Guardar'}
                </Button>
              </Box>
            </Stack>
          </Stack>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type { OpenState as ScheduleModalState };
