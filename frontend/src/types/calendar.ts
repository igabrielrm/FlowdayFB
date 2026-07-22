import type { ActividadListItem } from './activity';
import { buildOccurrences } from '../utils/recurrence';

export type CalendarCell = {
  key: string;
  day: number;
  date: string | null;
  inMonth: boolean;
  isToday: boolean;
};

export type CalendarView = 'month' | 'year';

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function monthLabel(year: number, month: number) {
  return `${MONTHS_ES[month - 1]} ${year}`;
}

export function buildMonthGrid(year: number, month: number): CalendarCell[] {
  const cells: CalendarCell[] = [];
  const today = new Date();
  const hoyD = today.getDate();
  const hoyM = today.getMonth() + 1;
  const hoyY = today.getFullYear();

  const primerDia = new Date(year, month - 1, 1);
  const diasEnMes = new Date(year, month, 0).getDate();
  const primerDiaSemana = primerDia.getDay();
  const inicio = primerDiaSemana === 0 ? 6 : primerDiaSemana - 1;

  const diasMesAnterior = new Date(year, month - 1, 0).getDate();
  for (let i = inicio - 1; i >= 0; i--) {
    const day = diasMesAnterior - i;
    cells.push({
      key: `prev-${day}`,
      day,
      date: null,
      inMonth: false,
      isToday: false,
    });
  }

  for (let d = 1; d <= diasEnMes; d++) {
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    cells.push({
      key: date,
      day: d,
      date,
      inMonth: true,
      isToday: d === hoyD && month === hoyM && year === hoyY,
    });
  }

  const faltantes = 42 - cells.length;
  for (let d = 1; d <= faltantes; d++) {
    cells.push({
      key: `next-${d}`,
      day: d,
      date: null,
      inMonth: false,
      isToday: false,
    });
  }

  return cells;
}

export function expandRecurringActivities(
  activities: ActividadListItem[],
  year: number,
  month: number,
): ActividadListItem[] {
  const diasEnMes = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, '0')}-${String(diasEnMes).padStart(2, '0')}`;
  const result: ActividadListItem[] = [];

  for (const a of activities) {
    if (!a.recurrence?.enabled || !a.fechaInicio) {
      result.push(a);
      continue;
    }
    const dates = buildOccurrences(
      a.recurrence.kind,
      a.recurrence.interval,
      a.fechaInicio,
      24,
      a.recurrence.endDate,
    );
    let found = false;
    for (const d of dates) {
      if (d >= monthStart && d <= monthEnd && d !== a.fechaInicio) {
        result.push({ ...a, id: `${a.id}__${d}`, fechaInicio: d });
        found = true;
      }
    }
    if (!found) {
      if (a.fechaInicio >= monthStart && a.fechaInicio <= monthEnd) {
        result.push(a);
      }
    }
  }

  return result;
}

export function groupByDate(activities: ActividadListItem[]) {
  const map: Record<string, ActividadListItem[]> = {};
  for (const a of activities) {
    if (!a.fechaInicio) continue;
    const key = a.fechaInicio.split('T')[0];
    if (!map[key]) map[key] = [];
    map[key].push(a);
  }
  return map;
}

export function dayPriorityStyle(items: ActividadListItem[]) {
  if (items.length === 0) return undefined;
  const pending = items.filter((a) => a.estado !== 'COMPLETADA');
  if (pending.some((a) => a.prioridad === 'ALTA')) {
    return { background: 'rgba(239, 68, 68, 0.15)', borderLeft: '4px solid #ef4444' };
  }
  if (pending.some((a) => a.prioridad === 'MEDIA')) {
    return { background: 'rgba(245, 158, 11, 0.10)', borderLeft: '4px solid #f59e0b' };
  }
  return { background: 'rgba(34, 197, 94, 0.05)', borderLeft: '4px solid #22c55e' };
}

export { WEEKDAYS };
