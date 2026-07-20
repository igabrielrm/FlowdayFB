import { describe, expect, it } from 'vitest';
import { resolveActivityDetailState } from './activityDetailState';

describe('resolveActivityDetailState', () => {
  it('prefers the live response when it is available', () => {
    const apiResult = { ok: true, data: { id: 7, titulo: 'Live', esPropietario: true, puedeEditar: true, companerosIds: [] }, error: null };
    const cached = { id: 7, titulo: 'Cached', esPropietario: true, puedeEditar: true, companerosIds: [] };

    const state = resolveActivityDetailState(apiResult, cached);

    expect(state.detail?.titulo).toBe('Live');
    expect(state.usedCache).toBe(false);
  });

  it('falls back to local cache when the request fails', () => {
    const apiResult = { ok: false, data: null, error: 'No disponible' };
    const cached = { id: 7, titulo: 'Cached', esPropietario: true, puedeEditar: true, companerosIds: [] };

    const state = resolveActivityDetailState(apiResult, cached);

    expect(state.detail?.titulo).toBe('Cached');
    expect(state.usedCache).toBe(true);
    expect(state.error).toBeNull();
  });

  it('returns an error when there is neither a live response nor local cache', () => {
    const state = resolveActivityDetailState({ ok: false, data: null, error: 'No disponible' }, null);

    expect(state.detail).toBeNull();
    expect(state.error).toBe('No disponible');
    expect(state.usedCache).toBe(false);
  });
});
