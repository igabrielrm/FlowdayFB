import type { RecurrenceConfig } from '../utils/recurrence';

export type Note = {
  id: string;
  version?: number;
  titulo: string;
  contenido: string;
  pinned: boolean;
  color: string;
  recurrence?: RecurrenceConfig;
  createdAt?: string;
  updatedAt?: string;
};

export type NoteColor = {
  value: string;
  label: string;
  bgLight: string;
  bgDark: string;
};

export const NOTE_COLORS: NoteColor[] = [
  { value: '#ffffff', label: 'Blanco', bgLight: '#ffffff', bgDark: '#1e293b' },
  { value: '#ef4444', label: 'Rojo', bgLight: '#fee2e2', bgDark: '#991b1b' },
  { value: '#f97316', label: 'Naranja', bgLight: '#ffedd5', bgDark: '#9a3412' },
  { value: '#eab308', label: 'Amarillo', bgLight: '#fef9c3', bgDark: '#854d0e' },
  { value: '#22c55e', label: 'Verde', bgLight: '#dcfce7', bgDark: '#166534' },
  { value: '#14b8a6', label: 'Teal', bgLight: '#ccfbf1', bgDark: '#115e59' },
  { value: '#3b82f6', label: 'Azul', bgLight: '#dbeafe', bgDark: '#1e40af' },
  { value: '#6366f1', label: 'Índigo', bgLight: '#e0e7ff', bgDark: '#3730a3' },
  { value: '#a855f7', label: 'Morado', bgLight: '#f3e8ff', bgDark: '#6b21a8' },
  { value: '#ec4899', label: 'Rosa', bgLight: '#fce7f3', bgDark: '#9d174d' },
];
