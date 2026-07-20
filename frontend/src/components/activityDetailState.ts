import type { ApiResponse } from '../api/client';
import type { ActividadDetail } from '../types/activity';

export type ActivityDetailState = {
  detail: ActividadDetail | null;
  loading: boolean;
  error: string | null;
  usedCache: boolean;
};

export function resolveActivityDetailState(
  apiResult: ApiResponse<ActividadDetail>,
  cachedDetail: ActividadDetail | null,
): ActivityDetailState {
  if (apiResult.ok && apiResult.data) {
    return { detail: apiResult.data, loading: false, error: null, usedCache: false };
  }

  if (cachedDetail) {
    return {
      detail: cachedDetail,
      loading: false,
      error: null,
      usedCache: true,
    };
  }

  return {
    detail: null,
    loading: false,
    error: apiResult.error || 'No se pudo cargar la actividad',
    usedCache: false,
  };
}
