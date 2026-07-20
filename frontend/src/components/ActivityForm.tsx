import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  Checkbox,
  createFilterOptions,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { api, UsuarioDto } from '../api/client';
import {
  ACTIVITY_STATES,
  ACTIVITY_TYPES,
  ACTIVITY_COLORS,
  ActividadDetail,
  CreateActividadPayload,
  isGroupActivityType,
} from '../types/activity';
import ColorSwatchPicker from './ColorSwatchPicker';
import { localDateIso } from '../utils/localDate';
import type { RecurrenceConfig, RecurrenceKind } from '../utils/recurrence';

export type ActivityFormValues = {
  titulo: string;
  tipo: string;
  fechaInicio: string;
  horaInicio: string;
  duracionMinutos: number;
  materia: string;
  prioridad: string;
  descripcion: string;
  estado: string;
  companerosIds: number[];
  color?: string;
  recurrence?: RecurrenceConfig;
};

type Props = {
  initial?: Partial<ActivityFormValues>;
  submitLabel: string;
  onSubmit: (payload: CreateActividadPayload & { estado?: string }) => Promise<string | null>;
  onCancelTo?: string;
};

type MateriaOption = string;

const filterMaterias = createFilterOptions<MateriaOption>();

function todayIso() {
  return localDateIso();
}

function parsePositiveInt(raw: string, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.round(n);
}

export default function ActivityForm({
  initial,
  submitLabel,
  onSubmit,
  onCancelTo = '/activities',
}: Props) {
  const [titulo, setTitulo] = useState(initial?.titulo ?? '');
  const [tipo, setTipo] = useState(initial?.tipo ?? 'DEBER');
  const [fechaInicio, setFechaInicio] = useState(initial?.fechaInicio ?? todayIso());
  const [horaInicio, setHoraInicio] = useState(initial?.horaInicio ?? '09:00');
  const [duracionMinutos, setDuracionMinutos] = useState<string>(
    String(initial?.duracionMinutos ?? 60),
  );
  const [materia, setMateria] = useState(initial?.materia ?? '');
  const [prioridad, setPrioridad] = useState(initial?.prioridad ?? 'MEDIA');
  const [descripcion, setDescripcion] = useState(initial?.descripcion ?? '');
  const [estado, setEstado] = useState(initial?.estado ?? 'PENDIENTE');
  const [companerosIds, setCompanerosIds] = useState<number[]>(initial?.companerosIds ?? []);
  const [color, setColor] = useState(initial?.color ?? '#3b82f6');
  const [recurrenceEnabled, setRecurrenceEnabled] = useState(Boolean(initial?.recurrence?.enabled));
  const [recurrenceKind, setRecurrenceKind] = useState<RecurrenceKind>(initial?.recurrence?.kind ?? 'daily');
  const [recurrenceInterval, setRecurrenceInterval] = useState(String(initial?.recurrence?.interval ?? 1));
  const [recurrenceEndDate, setRecurrenceEndDate] = useState(initial?.recurrence?.endDate ?? '');
  const [recurrenceMaxOccurrences, setRecurrenceMaxOccurrences] = useState(String(initial?.recurrence?.maxOccurrences ?? 3));
  const [connections, setConnections] = useState<UsuarioDto[]>([]);
  const [materiasHorario, setMateriasHorario] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.schedule.list().then((res) => {
      if (!res.ok || !res.data) return;
      const unique = Array.from(
        new Set(
          res.data
            .map((b) => b.materia?.trim())
            .filter((m): m is string => !!m),
        ),
      ).sort((a, b) => a.localeCompare(b, 'es'));
      setMateriasHorario(unique);
    });
  }, []);

  useEffect(() => {
    if (!isGroupActivityType(tipo)) {
      setCompanerosIds([]);
      return;
    }
    api.community.connections().then((res) => {
      if (res.ok && res.data) setConnections(res.data);
    });
  }, [tipo]);

  const materiaOptions = useMemo(() => {
    const set = new Set(materiasHorario);
    if (materia.trim()) set.add(materia.trim());
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'));
  }, [materiasHorario, materia]);

  function toggleCompanion(id: number) {
    setCompanerosIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const duracion = parsePositiveInt(duracionMinutos, 60);
    const recurrence = recurrenceEnabled
      ? {
          enabled: true,
          kind: recurrenceKind,
          interval: parsePositiveInt(recurrenceInterval, 1),
          endDate: recurrenceEndDate || undefined,
          maxOccurrences: parsePositiveInt(recurrenceMaxOccurrences, 3),
        } satisfies RecurrenceConfig
      : undefined;

    const err = await onSubmit({
      titulo,
      tipo,
      fechaInicio,
      horaInicio: horaInicio || undefined,
      duracionMinutos: duracion,
      materia: materia.trim() || undefined,
      prioridad,
      descripcion: descripcion || undefined,
      companerosIds: isGroupActivityType(tipo) && companerosIds.length > 0 ? companerosIds : undefined,
      color,
      estado,
      recurrence,
    });
    if (err) setError(err);
    setSubmitting(false);
  }

  return (
    <Card component="form" onSubmit={handleSubmit} sx={{ p: { xs: 2, sm: 3 } }}>
      <Stack spacing={2.5}>
        {error && <Alert severity="error">{error}</Alert>}

        <TextField
          label="Título"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          required
          inputProps={{ maxLength: 200 }}
        />

        <FormControl>
          <InputLabel>Tipo</InputLabel>
          <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
            {ACTIVITY_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Fecha"
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            required
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
          <TextField
            label="Hora"
            type="time"
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </Stack>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label="Duración (min)"
            type="number"
            inputProps={{ min: 1, step: 5 }}
            value={duracionMinutos}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                setDuracionMinutos('');
                return;
              }
              if (/^\d+$/.test(v)) setDuracionMinutos(v);
            }}
            fullWidth
            helperText="Vacío al enviar = 60 min"
          />
          <FormControl fullWidth>
            <InputLabel>Prioridad</InputLabel>
            <Select label="Prioridad" value={prioridad} onChange={(e) => setPrioridad(e.target.value)}>
              <MenuItem value="ALTA">Alta</MenuItem>
              <MenuItem value="MEDIA">Media</MenuItem>
              <MenuItem value="BAJA">Baja</MenuItem>
            </Select>
          </FormControl>
        </Stack>

        {initial?.estado !== undefined && (
          <FormControl>
            <InputLabel>Estado</InputLabel>
            <Select label="Estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
              {ACTIVITY_STATES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <Autocomplete
          freeSolo
          options={materiaOptions}
          value={materia}
          onChange={(_e, value) => setMateria(typeof value === 'string' ? value : value ?? '')}
          onInputChange={(_e, value) => setMateria(value)}
          filterOptions={(options, params) => {
            const filtered = filterMaterias(options, params);
            const input = params.inputValue.trim();
            if (input && !options.some((o) => o.toLowerCase() === input.toLowerCase())) {
              filtered.push(input);
            }
            return filtered;
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Materia"
              helperText={
                materiasHorario.length > 0
                  ? 'Elige una materia de tu horario (o escribe otra)'
                  : 'Opcional — añade materias en Horario para elegirlas aquí'
              }
            />
          )}
        />

        <ColorSwatchPicker
          value={color}
          onChange={setColor}
          colors={ACTIVITY_COLORS}
          legend="Color en calendario"
        />

        <TextField
          label="Descripción (opcional)"
          multiline
          rows={3}
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />

        <Box sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
          <FormControlLabel
            control={<Checkbox checked={recurrenceEnabled} onChange={(_, checked) => setRecurrenceEnabled(checked)} />}
            label="Repetir esta actividad"
          />
          {recurrenceEnabled && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <FormControl fullWidth size="small">
                  <InputLabel>Frecuencia</InputLabel>
                  <Select label="Frecuencia" value={recurrenceKind} onChange={(e) => setRecurrenceKind(e.target.value as RecurrenceKind)}>
                    <MenuItem value="daily">Diaria</MenuItem>
                    <MenuItem value="weekly">Semanal</MenuItem>
                    <MenuItem value="monthly">Mensual</MenuItem>
                  </Select>
                </FormControl>
                <TextField
                  label="Cada"
                  type="number"
                  size="small"
                  value={recurrenceInterval}
                  onChange={(e) => setRecurrenceInterval(e.target.value)}
                  inputProps={{ min: 1, max: 12 }}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField
                  label="Hasta"
                  type="date"
                  size="small"
                  value={recurrenceEndDate}
                  onChange={(e) => setRecurrenceEndDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
                <TextField
                  label="Máx. repeticiones"
                  type="number"
                  size="small"
                  value={recurrenceMaxOccurrences}
                  onChange={(e) => setRecurrenceMaxOccurrences(e.target.value)}
                  inputProps={{ min: 1, max: 24 }}
                  fullWidth
                />
              </Stack>
            </Stack>
          )}
        </Box>

        {isGroupActivityType(tipo) && (
          <FormControl component="fieldset">
            <FormLabel component="legend">Compañeros conectados</FormLabel>
            {connections.length === 0 ? (
              <Typography variant="body2" color="text.secondary" mt={1}>
                No tienes conexiones aún.{' '}
                <Typography component={RouterLink} to="/community" variant="body2" color="primary">
                  Ir a Comunidad
                </Typography>{' '}
                para enviar solicitudes.
              </Typography>
            ) : (
              <FormGroup>
                {connections.map((c) => (
                  <FormControlLabel
                    key={c.id}
                    control={
                      <Checkbox
                        checked={companerosIds.includes(c.id)}
                        onChange={() => toggleCompanion(c.id)}
                      />
                    }
                    label={
                      <Box>
                        {c.nombre}
                        <Typography variant="caption" color="text.secondary" display="block">
                          {c.correo}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </FormGroup>
            )}
          </FormControl>
        )}

        <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} justifyContent="flex-end">
          <Button component={RouterLink} to={onCancelTo}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Guardando…' : submitLabel}
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}

export function detailToFormValues(detail: ActividadDetail): ActivityFormValues {
  return {
    titulo: detail.titulo,
    tipo: detail.tipo,
    fechaInicio: detail.fechaInicio ?? todayIso(),
    horaInicio: detail.horaInicio?.slice(0, 5) ?? '09:00',
    duracionMinutos: detail.duracionMinutos ?? 60,
    materia: detail.materia ?? '',
    prioridad: detail.prioridad ?? 'MEDIA',
    descripcion: detail.descripcion ?? '',
    estado: detail.estado,
    companerosIds: detail.companerosIds ?? [],
    color: detail.color ?? '#3b82f6',
    recurrence: detail.recurrence,
  };
}
