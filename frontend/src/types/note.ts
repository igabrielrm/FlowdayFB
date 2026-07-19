export type Note = {
  id: string;
  version?: number;
  titulo: string;
  contenido: string;
  pinned: boolean;
  color: string;
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
  { value: '#fca5a5', label: 'Rojo', bgLight: '#fee2e2', bgDark: '#7f1d1d' },
  { value: '#fdba74', label: 'Naranja', bgLight: '#ffedd5', bgDark: '#7c2d12' },
  { value: '#fef08a', label: 'Amarillo', bgLight: '#fef9c3', bgDark: '#713f12' },
  { value: '#86efac', label: 'Verde', bgLight: '#dcfce7', bgDark: '#14532d' },
  { value: '#99f6e4', label: 'Teal', bgLight: '#ccfbf1', bgDark: '#134e5e' },
  { value: '#93c5fd', label: 'Azul', bgLight: '#dbeafe', bgDark: '#1e3a8a' },
  { value: '#a5b4fc', label: 'Índigo', bgLight: '#e0e7ff', bgDark: '#312e81' },
  { value: '#c084fc', label: 'Morado', bgLight: '#f3e8ff', bgDark: '#581c87' },
  { value: '#f472b6', label: 'Rosa', bgLight: '#fce7f3', bgDark: '#831843' },
];
