import { describe, expect, it } from 'vitest';
import { buildOccurrences, type RecurrenceKind } from './recurrence';

describe('buildOccurrences', () => {
  it('creates daily occurrences until the provided limit', () => {
    const occurrences = buildOccurrences('daily', 1, '2026-07-20', 3);
    expect(occurrences).toEqual(['2026-07-20', '2026-07-21', '2026-07-22']);
  });

  it('creates weekly occurrences from the base date', () => {
    const occurrences = buildOccurrences('weekly', 2, '2026-07-20', 3);
    expect(occurrences).toEqual(['2026-07-20', '2026-08-03', '2026-08-17']);
  });

  it('creates monthly occurrences from the base date', () => {
    const occurrences = buildOccurrences('monthly', 1, '2026-07-20', 3);
    expect(occurrences).toEqual(['2026-07-20', '2026-08-20', '2026-09-20']);
  });

  it('respects an end date', () => {
    const occurrences = buildOccurrences('daily', 1, '2026-07-20', 10, '2026-07-22');
    expect(occurrences).toEqual(['2026-07-20', '2026-07-21', '2026-07-22']);
  });
});
