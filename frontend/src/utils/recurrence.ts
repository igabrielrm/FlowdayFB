export type RecurrenceKind = 'daily' | 'weekly' | 'monthly' | 'annual';

export type RecurrenceConfig = {
  enabled: boolean;
  kind: RecurrenceKind;
  interval: number;
  endDate?: string | null;
};

export function buildOccurrences(
  kind: RecurrenceKind,
  interval: number,
  startDate: string,
  maxOccurrences = 6,
  endDate?: string | null,
): string[] {
  if (!startDate) return [];
  const occurrences: string[] = [];
  const [year, month, day] = startDate.split('-').map(Number);
  let cursor = new Date(Date.UTC(year, month - 1, day));
  const end = endDate ? new Date(`${endDate}T00:00:00Z`) : null;

  for (let index = 0; index < maxOccurrences; index += 1) {
    const iso = cursor.toISOString().slice(0, 10);
    if (end && cursor > end) break;
    occurrences.push(iso);
    if (kind === 'daily') {
      cursor = new Date(cursor.getTime() + interval * 24 * 60 * 60 * 1000);
    } else if (kind === 'weekly') {
      cursor = new Date(cursor.getTime() + interval * 7 * 24 * 60 * 60 * 1000);
    } else if (kind === 'annual') {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear() + interval, cursor.getUTCMonth(), cursor.getUTCDate()));
    } else {
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + interval, cursor.getUTCDate()));
    }
  }

  return occurrences;
}
