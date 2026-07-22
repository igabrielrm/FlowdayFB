import type { RecurrenceConfig } from '../utils/recurrence';

export type ActividadListItem = {
  id: number | string;
  version?: number;
  titulo: string;
  tipo: string;
  estado: string;
  materia?: string | null;
  fechaInicio?: string | null;
  horaInicio?: string | null;
  prioridad?: string | null;
  duracionMinutos?: number | null;
  color?: string | null;
  esPropietario: boolean;
  esCompartida: boolean;
  recurrence?: RecurrenceConfig;
  updatedAt?: string;
};

export type ActividadDetail = {
  id: number | string;
  version?: number;
  titulo: string;
  descripcion?: string | null;
  tipo: string;
  estado: string;
  fechaInicio?: string | null;
  horaInicio?: string | null;
  duracionMinutos?: number | null;
  materia?: string | null;
  prioridad?: string | null;
  fechaEntrega?: string | null;
  color?: string | null;
  esPropietario: boolean;
  puedeEditar: boolean;
  companerosIds: number[];
  recurrence?: RecurrenceConfig;
  updatedAt?: string;
};

export type PriorityAlert = {
  id: number | string;
  titulo: string;
  tipo: string;
  motivo: string;
  fechaEntrega?: string | null;
  prioridad?: string | null;
};



export const ACTIVITY_COLORS = [
  { value: '#22c55e', label: 'Verde' },
  { value: '#3b82f6', label: 'Azul' },
  { value: '#f59e0b', label: 'Amarillo' },
  { value: '#ef4444', label: 'Rojo' },
  { value: '#a855f7', label: 'Morado' },
  { value: '#06b6d4', label: 'Celeste' },
  { value: '#ec4899', label: 'Rosa' },
  { value: '#64748b', label: 'Gris' },
] as const;

export type CreateActividadPayload = {
  titulo: string;
  tipo: string;
  fechaInicio: string;
  horaInicio?: string;
  duracionMinutos?: number;
  materia?: string;
  prioridad?: string;
  fechaEntrega?: string;
  descripcion?: string;
  companerosIds?: number[];
  color?: string;
  recurrence?: RecurrenceConfig;
};

export type UpdateActividadPayload = CreateActividadPayload & {
  estado?: string;
};

export const GROUP_ACTIVITY_TYPES = ['REUNION_GRUPAL', 'TRABAJO_GRUPO'] as const;

export function isGroupActivityType(tipo: string) {
  return (GROUP_ACTIVITY_TYPES as readonly string[]).includes(tipo);
}

export const ACTIVITY_TYPES = [
  { value: 'DEBER', label: 'Tarea / Deber' },
  { value: 'EXAMEN', label: 'Examen' },
  { value: 'REUNION_GRUPAL', label: 'Reunión grupal' },
  { value: 'TRABAJO_GRUPO', label: 'Trabajo en grupo' },
  { value: 'CITA_MEDICA', label: 'Cita médica' },
  { value: 'CITA_LABORAL', label: 'Cita laboral' },
  { value: 'OTRO', label: 'Otro' },
] as const;

export const ACTIVITY_STATES = [
  { value: 'PENDIENTE', label: 'Pendiente' },
  { value: 'COMPLETADA', label: 'Completada' },
] as const;

export function tipoLabel(tipo: string) {
  return ACTIVITY_TYPES.find((t) => t.value === tipo)?.label ?? tipo;
}

export function estadoLabel(estado: string) {
  return ACTIVITY_STATES.find((s) => s.value === estado)?.label ?? estado;
}

export function formatDate(iso?: string | null) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
