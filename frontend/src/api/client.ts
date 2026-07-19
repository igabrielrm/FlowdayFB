export type UsuarioDto = {
  id: number;
  nombre: string;
  correo: string;
  rol: string;
  tema?: string;
  foto?: string;
};

export type ApiResponse<T> = {
  ok: boolean;
  data: T | null;
  error: string | null;
  meta?: Record<string, unknown>;
};

export type AssistantProposal = {
  id: string;
  type: 'CREATE_ACTIVITY' | 'RESCHEDULE_ACTIVITY';
  summary?: string;
  payload?: Record<string, unknown>;
  conflicts?: string[];
  expiresAt?: string;
  activityId?: number | null;
  status?: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
};

export type AssistantMessageResponse = {
  respuesta: string;
  proposal?: AssistantProposal | null;
  ia?: boolean;
  fallback?: boolean;
};

import type { ActividadDetail, ActividadListItem, CreateActividadPayload, PriorityAlert, ReschedulableItem, UpdateActividadPayload } from '../types/activity';
import type { NotificationItem } from '../notifications/types';
import type { Profile, UpdateProfilePayload } from '../types/profile';
import type { CommunityStats, CommunityUser } from '../types/community';
import type { CreateScheduleBlockPayload, ScheduleAlert, ScheduleBlock } from '../types/schedule';
import type { ChatMessage, Conversation } from '../types/chat';
import type { Note } from '../types/note';
import type {
  AdminAnnouncement,
  AdminStats,
  AdminTopUser,
  AdminUser,
  AdminWellbeing,
} from '../types/admin';
import type { StressReport, WellbeingStats } from '../types/wellbeing';
import {
  cacheApiGet,
  cacheSessionUser,
  isBrowserOffline,
  readApiGet,
} from '../offline/cache';
import { notifyOfflineQueueChanged } from '../events';
import {
  applyActivityCreate,
  applyActivityDelete,
  applyActivityReschedule,
  applyActivityStatus,
  applyActivityUpdate,
  applyScheduleCreate,
  applyScheduleDelete,
  applyScheduleUpdate,
  applyNoteCreate,
  applyNoteUpdate,
  applyNoteDelete,
  buildOptimisticActivity,
  buildOptimisticNote,
  buildOptimisticScheduleBlock,
} from '../offline/optimistic';
import {
  allocateTempId,
  enqueue,
  type OfflineMutationKind,
} from '../offline/queue';
import {
  applyChatDelete,
  applyChatRead,
  applyChatSend,
  applyCommunityConnect,
  applyCommunityDecision,
  applyNotificationDelete,
  applyNotificationRead,
  applyProfileUpdate,
  applyWellbeingRecord,
} from '../offline/domainOptimistic';
import { apiUrl, isNative } from '../platform';
import {
  clearNativeTokens,
  getNativeRefreshToken,
  nativeAuthorizedFetch,
  refreshNativeAccessToken,
  storeNativeTokens,
} from '../auth/nativeAuth';

export type { NotificationItem };

const OFFLINE_MSG =
  'Sin conexión. Conéctate para esta acción o usa los datos guardados de tu última visita.';

const QUEUED_MSG = 'Guardado como borrador. Se sincronizará al reconectar.';

function isGetMethod(init?: RequestInit) {
  return (init?.method || 'GET').toUpperCase() === 'GET';
}

async function performFetch<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const res = await nativeAuthorizedFetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  if (res.status === 401) {
    return { ok: false, data: null, error: 'No autenticado' };
  }
  if (res.status === 204) {
    return { ok: true, data: null, error: null };
  }
  return (await res.json()) as ApiResponse<T>;
}

type QueuedRequestConfig<T> = {
  kind: OfflineMutationKind;
  label: string;
  path: string;
  init: RequestInit;
  entityId?: number | string;
  tempId?: number;
  expectedVersion?: number;
  optimistic: () => ApiResponse<T>;
};

async function queuedRequest<T>(config: QueuedRequestConfig<T>): Promise<ApiResponse<T>> {
  const queueOffline = async () => {
    const optimistic = config.optimistic();
    if (!optimistic.ok) {
      return optimistic;
    }
    await enqueue({
      kind: config.kind,
      label: config.label,
      method: (config.init.method || 'POST').toUpperCase() as 'POST' | 'PUT' | 'PATCH' | 'DELETE',
      path: config.path,
      body: typeof config.init.body === 'string' ? config.init.body : undefined,
      entityId: config.entityId ?? config.tempId,
      tempId: config.tempId,
      expectedVersion: config.expectedVersion,
    });
    notifyOfflineQueueChanged();
    return {
      ok: true,
      data: optimistic.data,
      error: null,
      meta: { offline: true, queued: true, message: QUEUED_MSG },
    };
  };

  if (isBrowserOffline()) {
    return queueOffline();
  }

  try {
    const response = await performFetch<T>(config.path, config.init);
    if (!response.ok) return response;
    return response;
  } catch {
    return queueOffline();
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  const isGet = isGetMethod(init);

  if (!isGet && isBrowserOffline()) {
    return { ok: false, data: null, error: OFFLINE_MSG };
  }

  try {
    const json = await performFetch<T>(path, init);
    const isGet = isGetMethod(init);
    if (isGet && json.ok && json.data != null) {
      cacheApiGet(path, json.data);
      if (path === '/api/v1/session/me') {
        cacheSessionUser(json.data as unknown as UsuarioDto);
      }
    }
    return json;
  } catch {
    if (isGet) {
      const cached = readApiGet<T>(path);
      if (cached != null) {
        return { ok: true, data: cached, error: null, meta: { offline: true } };
      }
    }
    return { ok: false, data: null, error: OFFLINE_MSG };
  }
}

async function legacyJson<T>(path: string, init?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  const isGet = isGetMethod(init);

  if (!isGet && isBrowserOffline()) {
    return { data: null, error: OFFLINE_MSG };
  }

  try {
    const res = await nativeAuthorizedFetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init,
    });
    if (res.status === 401) {
      return { data: null, error: 'No autenticado' };
    }
    const json = (await res.json()) as T & { error?: string };
    if (json && typeof json === 'object' && 'error' in json && json.error) {
      return { data: null, error: String(json.error) };
    }
    if (isGet && json != null) {
      cacheApiGet(path, json);
    }
    return { data: json, error: null };
  } catch {
    if (isGet) {
      const cached = readApiGet<T>(path);
      if (cached != null) {
        return { data: cached, error: null };
      }
    }
    return { data: null, error: OFFLINE_MSG };
  }
}

async function rawRequest<T>(path: string, init?: RequestInit): Promise<ApiResponse<T>> {
  if (!isGetMethod(init) && isBrowserOffline()) {
    return { ok: false, data: null, error: OFFLINE_MSG };
  }
  try {
    const response = await nativeAuthorizedFetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
      ...init,
    });
    if (response.status === 204) return { ok: true, data: null, error: null };
    const json = (await response.json()) as T & { error?: string; mensaje?: string };
    if (!response.ok || json?.error) {
      return {
        ok: false,
        data: null,
        error: json?.error || json?.mensaje || `Error ${response.status}`,
      };
    }
    return { ok: true, data: json, error: null };
  } catch {
    return { ok: false, data: null, error: OFFLINE_MSG };
  }
}

export async function downloadAdminReport(
  format: 'excel' | 'pdf' | 'csv',
  desde: string,
  hasta: string,
) {
  const params = new URLSearchParams();
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  const qs = params.toString();
  const res = await nativeAuthorizedFetch(`/admin/reportes/export/${format}${qs ? `?${qs}` : ''}`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('No se pudo descargar el reporte');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] || `reporte-flowday.${format === 'csv' ? 'zip' : format === 'excel' ? 'xlsx' : 'pdf'}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function loginRequest(correo: string, contrasena: string): Promise<ApiResponse<UsuarioDto>> {
  if (!isNative) {
    return request<UsuarioDto>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ correo, contrasena }),
    });
  }

  if (!navigator.onLine) {
    return {
      ok: false,
      data: null,
      error: 'Necesitas conexión a internet para iniciar sesión por primera vez.',
    };
  }

  try {
    const response = await fetch(apiUrl('/api/v1/mobile-auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: correo, password: contrasena }),
    });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        ok: false,
        data: null,
        error: 'El backend publicado todavía no es compatible con esta versión del APK.',
      };
    }
    const json = (await response.json()) as ApiResponse<unknown> & Record<string, unknown>;
    if (!response.ok || json.ok === false) {
      const serverError = String(json.error || json.mensaje || '');
      const outdatedBackend =
        response.status === 404
        || (response.status === 401 && serverError.toLowerCase().includes('no autenticado'));
      return {
        ok: false,
        data: null,
        error: outdatedBackend
          ? 'El backend móvil aún no está desplegado en Render.'
          : serverError || 'Correo o contraseña incorrectos',
      };
    }
    const container = (json.data && typeof json.data === 'object' ? json.data : json) as Record<string, unknown>;
    await storeNativeTokens(container);
    const user = (container.usuario ?? container.user ?? container) as UsuarioDto;
    if (!user?.id) {
      return { ok: false, data: null, error: 'Respuesta de autenticación inválida' };
    }
    return { ok: true, data: user, error: null };
  } catch {
    return {
      ok: false,
      data: null,
      error: navigator.onLine
        ? 'No se pudo conectar con Render. Comprueba que el servicio esté activo y permita el acceso del APK.'
        : 'Sin conexión a internet.',
    };
  }
}

async function mobileCompatibilityRequest(): Promise<ApiResponse<{ ready: boolean }>> {
  if (!isNative) return { ok: true, data: { ready: true }, error: null };
  if (!navigator.onLine) return { ok: false, data: null, error: 'Sin conexión a internet' };
  try {
    const response = await fetch(apiUrl('/api/v1/mobile-auth/oauth-contract'));
    if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) {
      return {
        ok: false,
        data: null,
        error: 'El backend móvil pendiente todavía no está desplegado.',
      };
    }
    return { ok: true, data: { ready: true }, error: null };
  } catch {
    return { ok: false, data: null, error: 'No se pudo contactar con el backend de Render.' };
  }
}

async function logoutRequest(): Promise<ApiResponse<void>> {
  if (!isNative) {
    return request<void>('/api/v1/auth/logout', { method: 'POST', body: '{}' });
  }
  try {
    await refreshNativeAccessToken();
    const refreshToken = await getNativeRefreshToken();
    await nativeAuthorizedFetch('/api/v1/mobile-auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } finally {
    await clearNativeTokens();
  }
  return { ok: true, data: null, error: null };
}

async function queuedLegacyMutation(
  kind: OfflineMutationKind,
  label: string,
  path: string,
  body: Record<string, unknown>,
  optimistic: () => void,
): Promise<{ data: { mensaje: string } | null; error: string | null }> {
  const queue = async () => {
    optimistic();
    await enqueue({
      kind,
      label,
      method: 'POST',
      path,
      body: JSON.stringify(body),
    });
    notifyOfflineQueueChanged();
    return { data: { mensaje: QUEUED_MSG }, error: null };
  };
  if (isBrowserOffline()) return queue();
  const result = await legacyJson<{ mensaje: string }>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return result.error === OFFLINE_MSG ? queue() : result;
}

export const api = {
  me: () => request<UsuarioDto>('/api/v1/session/me'),
  login: loginRequest,
  mobileCompatibility: mobileCompatibilityRequest,
  adminLogin: (correo: string, contrasena: string) =>
    request<UsuarioDto>('/api/v1/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ correo, contrasena }),
    }),
  logout: logoutRequest,
  oauthProviders: () => request<string[]>('/api/v1/auth/oauth-providers'),
  register: (payload: {
    nombre: string;
    correo: string;
    contrasena: string;
    telefono: string;
    fechaNacimiento?: string;
    genero?: string;
  }) =>
    request<{ mensaje: string }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  forgotPassword: (correo: string, telefono: string) =>
    request<{ mensaje: string }>('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ correo, telefono }),
    }),
  resetPasswordSession: () => request<{ active: boolean }>('/api/v1/auth/reset-password/session'),
  resetPassword: (contrasenaNueva: string, contrasenaConfirmacion: string) =>
    request<{ mensaje: string }>('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ contrasenaNueva, contrasenaConfirmacion }),
    }),

  activities: {
    list: () => request<ActividadListItem[]>('/api/v1/activities'),
    get: (id: number) => {
      if (id < 0) {
        const cached = readApiGet<ActividadDetail>(`/api/v1/activities/${id}`);
        if (cached) {
          return Promise.resolve({
            ok: true,
            data: cached,
            error: null,
            meta: { offline: true, draft: true },
          });
        }
        return Promise.resolve({ ok: false, data: null, error: 'Borrador no encontrado' });
      }
      return request<ActividadDetail>(`/api/v1/activities/${id}`);
    },
    byDate: (fecha: string) =>
      request<ActividadListItem[]>(`/api/v1/activities/by-date?fecha=${encodeURIComponent(fecha)}`),
    byMonth: (year: number, month: number) =>
      request<ActividadListItem[]>(
        `/api/v1/activities/by-month?year=${year}&month=${month}`,
      ),
    create: (payload: CreateActividadPayload) => {
      const tempId = allocateTempId();
      const body = JSON.stringify(payload);
      return queuedRequest<ActividadDetail>({
        kind: 'activity.create',
        label: `Crear actividad: ${payload.titulo}`,
        path: '/api/v1/activities',
        init: { method: 'POST', body },
        tempId,
        optimistic: () => {
          const detail = buildOptimisticActivity(payload, tempId);
          applyActivityCreate(detail);
          return { ok: true, data: detail, error: null };
        },
      });
    },
    update: (id: number, payload: UpdateActividadPayload) => {
      const body = JSON.stringify(payload);
      return queuedRequest<ActividadDetail>({
        kind: 'activity.update',
        label: `Actualizar actividad: ${payload.titulo}`,
        path: `/api/v1/activities/${id}`,
        init: { method: 'PUT', body },
        entityId: id,
        expectedVersion:
          readApiGet<ActividadDetail>(`/api/v1/activities/${id}`)?.version
          ?? readApiGet<ActividadListItem[]>('/api/v1/activities')?.find((activity) => activity.id === id)?.version,
        optimistic: () => {
          const existing =
            readApiGet<ActividadDetail>(`/api/v1/activities/${id}`)
            ?? readApiGet<ActividadListItem[]>('/api/v1/activities')?.find((activity) => activity.id === id);
          if (!existing) return { ok: false, data: null, error: 'Actividad no disponible offline' };
          applyActivityUpdate(id, payload);
          const detail = readApiGet<ActividadDetail>(`/api/v1/activities/${id}`);
          return detail
            ? { ok: true, data: detail, error: null }
            : { ok: false, data: null, error: OFFLINE_MSG };
        },
      });
    },
    updateStatus: (id: number, estado: string) => {
      const body = JSON.stringify({ estado });
      return queuedRequest<ActividadListItem>({
        kind: 'activity.status',
        label: 'Cambiar estado de actividad',
        path: `/api/v1/activities/${id}/status`,
        init: { method: 'PATCH', body },
        entityId: id,
        expectedVersion:
          readApiGet<ActividadDetail>(`/api/v1/activities/${id}`)?.version
          ?? readApiGet<ActividadListItem[]>('/api/v1/activities')?.find((activity) => activity.id === id)?.version,
        optimistic: () => {
          const existing =
            readApiGet<ActividadDetail>(`/api/v1/activities/${id}`)
            ?? readApiGet<ActividadListItem[]>('/api/v1/activities')?.find((activity) => activity.id === id);
          if (!existing) return { ok: false, data: null, error: 'Actividad no disponible offline' };
          applyActivityStatus(id, estado);
          const list = readApiGet<ActividadListItem[]>('/api/v1/activities');
          const item = list?.find((a) => a.id === id);
          return item
            ? { ok: true, data: item, error: null }
            : { ok: false, data: null, error: OFFLINE_MSG };
        },
      });
    },
    remove: (id: number) =>
      queuedRequest<void>({
        kind: 'activity.delete',
        label: 'Eliminar actividad',
        path: `/api/v1/activities/${id}`,
        init: { method: 'DELETE' },
        entityId: id,
        expectedVersion:
          readApiGet<ActividadDetail>(`/api/v1/activities/${id}`)?.version
          ?? readApiGet<ActividadListItem[]>('/api/v1/activities')?.find((activity) => activity.id === id)?.version,
        optimistic: () => {
          applyActivityDelete(id);
          return { ok: true, data: null, error: null };
        },
      }),
    priorityAlerts: () => request<PriorityAlert[]>('/api/v1/activities/priority-alerts'),
    reschedulable: () => request<ReschedulableItem[]>('/api/v1/activities/reschedulable'),
    reschedule: (id: number, fecha: string, hora?: string) => {
      const body = JSON.stringify({ fecha, hora: hora || null });
      return queuedRequest<ActividadDetail>({
        kind: 'activity.reschedule',
        label: 'Reprogramar actividad',
        path: `/api/v1/activities/${id}/reschedule`,
        init: { method: 'POST', body },
        entityId: id,
        expectedVersion:
          readApiGet<ActividadDetail>(`/api/v1/activities/${id}`)?.version
          ?? readApiGet<ActividadListItem[]>('/api/v1/activities')?.find((activity) => activity.id === id)?.version,
        optimistic: () => {
          const existing =
            readApiGet<ActividadDetail>(`/api/v1/activities/${id}`)
            ?? readApiGet<ActividadListItem[]>('/api/v1/activities')?.find((activity) => activity.id === id);
          if (!existing) return { ok: false, data: null, error: 'Actividad no disponible offline' };
          applyActivityReschedule(id, fecha, hora);
          const detail = readApiGet<ActividadDetail>(`/api/v1/activities/${id}`);
          return detail
            ? { ok: true, data: detail, error: null }
            : { ok: false, data: null, error: OFFLINE_MSG };
        },
      });
    },
  },

  ia: {
    chat: async (mensaje: string, historial?: { rol: string; contenido: string }[]) => {
      const res = await nativeAuthorizedFetch('/api/ia/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensaje,
          idempotencyKey: crypto.randomUUID(),
          historial: (historial ?? []).map((m) => ({
            role: m.rol === 'user' ? 'user' : 'assistant',
            text: m.contenido,
          })),
        }),
      });
      if (res.status === 401) return { ok: false, data: null, error: 'Sesión expirada. Vuelve a iniciar sesión.' };
      const json = await res.json();
      if (json.ok === false) return { ok: false, data: null, error: json.mensaje || 'Error IA' };
      return { ok: true, data: json as { respuesta: string; ia?: boolean; fallback?: boolean }, error: null };
    },
    status: async () => {
      const res = await nativeAuthorizedFetch('/api/ia/status', { credentials: 'include' });
      const json = await res.json();
      if (json.ok === false) return { ok: false, data: null, error: json.error || 'No autenticado' };
      return {
        ok: true,
        data: json as { provider: string; groqConfigured: boolean; ready: boolean },
        error: null,
      };
    },
  },

  assistant: {
    message: (
      mensaje: string,
      historial?: { rol: string; contenido: string }[],
    ) =>
      rawRequest<AssistantMessageResponse>('/api/v1/assistant/messages', {
        method: 'POST',
        body: JSON.stringify({
          mensaje,
          historial: (historial ?? []).map((m) => ({
            role: m.rol === 'user' ? 'user' : 'assistant',
            text: m.contenido,
          })),
        }),
      }),
    confirm: (proposalId: string) =>
      rawRequest<AssistantProposal>(
        `/api/v1/assistant/actions/${encodeURIComponent(proposalId)}/confirm`,
        { method: 'POST', body: '{}' },
      ),
    cancel: (proposalId: string) =>
      rawRequest<AssistantProposal>(
        `/api/v1/assistant/actions/${encodeURIComponent(proposalId)}/cancel`,
        { method: 'POST', body: '{}' },
      ),
  },

  notifications: {
    list: () => request<NotificationItem[]>('/api/v1/notifications'),
    unreadCount: () => request<{ count: number }>('/api/v1/notifications/unread-count'),
    markRead: (id: number) =>
      queuedRequest<{ ok: boolean; count: number }>({
        kind: 'notification.read',
        label: 'Marcar notificación como leída',
        path: `/api/v1/notifications/${id}/read`,
        init: { method: 'POST', body: '{}' },
        entityId: id,
        optimistic: () => {
          applyNotificationRead(id);
          const count = readApiGet<{ count: number }>('/api/v1/notifications/unread-count')?.count ?? 0;
          return { ok: true, data: { ok: true, count }, error: null };
        },
      }),
    markAllRead: () =>
      queuedRequest<{ ok: boolean; count: number }>({
        kind: 'notification.readAll',
        label: 'Marcar todas las notificaciones como leídas',
        path: '/api/v1/notifications/read-all',
        init: { method: 'POST', body: '{}' },
        optimistic: () => {
          applyNotificationRead();
          return { ok: true, data: { ok: true, count: 0 }, error: null };
        },
      }),
    remove: (id: number) =>
      queuedRequest<{ ok: boolean; count: number }>({
        kind: 'notification.delete',
        label: 'Eliminar notificación',
        path: `/api/v1/notifications/${id}`,
        init: { method: 'DELETE' },
        entityId: id,
        optimistic: () => {
          applyNotificationDelete(id);
          const count = readApiGet<{ count: number }>('/api/v1/notifications/unread-count')?.count ?? 0;
          return { ok: true, data: { ok: true, count }, error: null };
        },
      }),
  },

  profile: {
    get: () => request<Profile>('/api/v1/profile'),
    update: (payload: UpdateProfilePayload) =>
      queuedRequest<Profile>({
        kind: 'profile.update',
        label: 'Actualizar perfil',
        path: '/api/v1/profile',
        init: { method: 'PATCH', body: JSON.stringify(payload) },
        optimistic: () => {
          const profile = applyProfileUpdate(payload);
          return profile
            ? { ok: true, data: profile, error: null }
            : { ok: false, data: null, error: 'Abre tu perfil con conexión antes de editarlo offline.' };
        },
      }),
    changePassword: (contrasenaActual: string, contrasenaNueva: string, contrasenaConfirmacion: string) =>
      request<void>('/api/v1/profile/password', {
        method: 'POST',
        body: JSON.stringify({ contrasenaActual, contrasenaNueva, contrasenaConfirmacion }),
      }),
    changeTheme: (tema: string) =>
      queuedRequest<Profile>({
        kind: 'profile.theme',
        label: 'Cambiar tema',
        path: '/api/v1/profile/theme',
        init: { method: 'PATCH', body: JSON.stringify({ tema }) },
        optimistic: () => {
          const profile = applyProfileUpdate({ tema });
          return profile
            ? { ok: true, data: profile, error: null }
            : { ok: false, data: null, error: 'Perfil no disponible offline' };
        },
      }),
    uploadPhoto: async (file: File): Promise<ApiResponse<Profile>> => {
      const form = new FormData();
      form.append('foto', file);
      const res = await nativeAuthorizedFetch('/api/v1/profile/photo', {
        method: 'POST',
        credentials: 'include',
        body: form,
      });
      if (res.status === 401) {
        return { ok: false, data: null, error: 'No autenticado' };
      }
      return res.json();
    },
  },

  community: {
    stats: () => request<CommunityStats>('/api/v1/community/stats'),
    users: (query?: string) => {
      const qs = query ? `?query=${encodeURIComponent(query)}` : '';
      return request<CommunityUser[]>(`/api/v1/community/users${qs}`);
    },
    suggestions: (limit = 4) =>
      request<CommunityUser[]>(`/api/v1/community/suggestions?limit=${limit}`),
    connections: () => request<UsuarioDto[]>('/api/v1/community/connections'),
    connect: (userId: number) =>
      queuedRequest<{ mensaje: string }>({
        kind: 'community.connect',
        label: 'Enviar solicitud de amistad',
        path: '/api/v1/community/connections',
        init: { method: 'POST', body: JSON.stringify({ userId }) },
        entityId: userId,
        optimistic: () => {
          applyCommunityConnect(userId);
          return { ok: true, data: { mensaje: QUEUED_MSG }, error: null };
        },
      }),
    accept: (conexionId: number) =>
      queuedRequest<{ mensaje: string }>({
        kind: 'community.accept',
        label: 'Aceptar solicitud de amistad',
        path: `/api/v1/community/connections/${conexionId}/accept`,
        init: { method: 'POST', body: '{}' },
        entityId: conexionId,
        optimistic: () => {
          applyCommunityDecision(conexionId, 'CONECTADO');
          return { ok: true, data: { mensaje: QUEUED_MSG }, error: null };
        },
      }),
    reject: (conexionId: number) =>
      queuedRequest<{ mensaje: string }>({
        kind: 'community.reject',
        label: 'Rechazar solicitud de amistad',
        path: `/api/v1/community/connections/${conexionId}/reject`,
        init: { method: 'POST', body: '{}' },
        entityId: conexionId,
        optimistic: () => {
          applyCommunityDecision(conexionId, 'NINGUNA');
          return { ok: true, data: { mensaje: QUEUED_MSG }, error: null };
        },
      }),
    removeConnection: (conexionId: number) =>
      queuedRequest<void>({
        kind: 'community.remove',
        label: 'Eliminar conexión',
        path: `/api/v1/community/connections/${conexionId}`,
        init: { method: 'DELETE' },
        entityId: conexionId,
        optimistic: () => {
          applyCommunityDecision(conexionId, 'NINGUNA');
          return { ok: true, data: null, error: null };
        },
      }),
  },

  chat: {
    conversations: () => request<Conversation[]>('/api/v1/chat/conversations'),
    messages: (userId: number) => request<ChatMessage[]>(`/api/v1/chat/messages/${userId}`),
    send: (destinatarioId: number, contenido: string) => {
      const tempId = allocateTempId();
      return queuedRequest<ChatMessage>({
        kind: 'chat.send',
        label: 'Enviar mensaje',
        path: '/api/v1/chat/messages',
        init: { method: 'POST', body: JSON.stringify({ destinatarioId, contenido }) },
        tempId,
        optimistic: () => ({
          ok: true,
          data: applyChatSend(destinatarioId, contenido, tempId),
          error: null,
        }),
      });
    },
    markRead: (userId: number) =>
      queuedRequest<{ updated: number }>({
        kind: 'chat.read',
        label: 'Marcar conversación como leída',
        path: `/api/v1/chat/messages/${userId}/read`,
        init: { method: 'POST', body: '{}' },
        entityId: userId,
        optimistic: () => {
          applyChatRead(userId);
          return { ok: true, data: { updated: 0 }, error: null };
        },
      }),
    unreadCount: () => request<{ count: number }>('/api/v1/chat/unread-count'),
    deleteConversation: (userId: number) =>
      queuedRequest<{ deleted: number }>({
        kind: 'chat.delete',
        label: 'Eliminar conversación',
        path: `/api/v1/chat/conversations/${userId}`,
        init: { method: 'DELETE' },
        entityId: userId,
        optimistic: () => {
          applyChatDelete(userId);
          return { ok: true, data: { deleted: 0 }, error: null };
        },
      }),
  },

  schedule: {
    list: () => request<ScheduleBlock[]>('/api/v1/schedule/blocks'),
    create: (payload: CreateScheduleBlockPayload) => {
      const tempId = allocateTempId();
      const body = JSON.stringify(payload);
      return queuedRequest<ScheduleBlock>({
        kind: 'schedule.create',
        label: `Agregar materia: ${payload.materia}`,
        path: '/api/v1/schedule/blocks',
        init: { method: 'POST', body },
        tempId,
        optimistic: () => {
          const block = buildOptimisticScheduleBlock(payload, tempId);
          applyScheduleCreate(block);
          return { ok: true, data: block, error: null };
        },
      });
    },
    update: (id: number, payload: CreateScheduleBlockPayload) => {
      const body = JSON.stringify(payload);
      return queuedRequest<ScheduleBlock>({
        kind: 'schedule.update',
        label: `Actualizar materia: ${payload.materia}`,
        path: `/api/v1/schedule/blocks/${id}`,
        init: { method: 'PUT', body },
        entityId: id,
        expectedVersion: readApiGet<ScheduleBlock[]>('/api/v1/schedule/blocks')
          ?.find((block) => block.id === id)?.version,
        optimistic: () => {
          const existing = readApiGet<ScheduleBlock[]>('/api/v1/schedule/blocks')?.find((block) => block.id === id);
          if (!existing) return { ok: false, data: null, error: 'Clase no disponible offline' };
          applyScheduleUpdate(id, payload);
          const list = readApiGet<ScheduleBlock[]>('/api/v1/schedule/blocks');
          const block = list?.find((b) => b.id === id);
          return block
            ? { ok: true, data: block, error: null }
            : { ok: false, data: null, error: OFFLINE_MSG };
        },
      });
    },
    remove: (id: number) =>
      queuedRequest<void>({
        kind: 'schedule.delete',
        label: 'Eliminar materia del horario',
        path: `/api/v1/schedule/blocks/${id}`,
        init: { method: 'DELETE' },
        entityId: id,
        expectedVersion: readApiGet<ScheduleBlock[]>('/api/v1/schedule/blocks')
          ?.find((block) => block.id === id)?.version,
        optimistic: () => {
          applyScheduleDelete(id);
          return { ok: true, data: null, error: null };
        },
      }),
    alert: (minutesBefore = 15) =>
      request<ScheduleAlert | null>(`/api/v1/schedule/alert?minutesBefore=${minutesBefore}`),
  },

  notes: {
    list: () => request<Note[]>('/api/v1/notes'),
    create: (titulo: string, contenido: string, color: string, pinned = false) => {
      const id = crypto.randomUUID();
      const note = buildOptimisticNote(id, titulo, contenido, color, pinned);
      const body = JSON.stringify({ id, titulo, contenido, color, pinned, updatedAt: note.updatedAt });
      return queuedRequest<Note>({
        kind: 'note.create',
        label: `Crear nota: ${titulo}`,
        path: '/api/v1/notes',
        init: { method: 'POST', body },
        entityId: id,
        optimistic: () => {
          applyNoteCreate(note);
          return { ok: true, data: note, error: null };
        },
      });
    },
    update: (id: string, patch: Partial<Omit<Note, 'id' | 'createdAt'>>) => {
      const existing = readApiGet<Note[]>('/api/v1/notes')?.find((n) => n.id === id)
        ?? readApiGet<Note>(`/api/v1/notes/${id}`);
      const updatedAt = new Date().toISOString();
      const body = JSON.stringify({ id, ...patch, updatedAt });
      return queuedRequest<Note>({
        kind: 'note.update',
        label: `Actualizar nota`,
        path: `/api/v1/notes/${id}`,
        init: { method: 'PUT', body },
        entityId: id,
        optimistic: () => {
          if (!existing) return { ok: false, data: null, error: 'Nota no disponible offline' };
          applyNoteUpdate(id, patch);
          const updated = readApiGet<Note[]>('/api/v1/notes')?.find((n) => n.id === id);
          return updated
            ? { ok: true, data: updated, error: null }
            : { ok: false, data: null, error: OFFLINE_MSG };
        },
      });
    },
    remove: (id: string) =>
      queuedRequest<void>({
        kind: 'note.delete',
        label: 'Eliminar nota',
        path: `/api/v1/notes/${id}`,
        init: { method: 'DELETE' },
        entityId: id,
        optimistic: () => {
          applyNoteDelete(id);
          return { ok: true, data: null, error: null };
        },
      }),
  },

  admin: {
    stats: () => request<AdminStats>('/api/v1/admin/stats'),
    wellbeing: () => request<AdminWellbeing>('/api/v1/admin/wellbeing'),
    users: () => request<AdminUser[]>('/api/v1/admin/users'),
    topUsers: (limit = 8) => request<AdminTopUser[]>(`/api/v1/admin/users/top?limit=${limit}`),
    toggleRole: (id: number) =>
      request<{ id: number; rol: string }>(`/api/v1/admin/users/${id}/role`, {
        method: 'PATCH',
        body: '{}',
      }),
    deleteUser: (id: number) =>
      request<{ ok: boolean }>(`/api/v1/admin/users/${id}`, { method: 'DELETE' }),
    announcements: () =>
      request<{ activos: AdminAnnouncement[]; archivados: AdminAnnouncement[] }>(
        '/api/v1/admin/announcements',
      ),
    createAnnouncement: (payload: { titulo: string; descripcion: string; fechaLimite: string }) =>
      request<AdminAnnouncement>('/api/v1/admin/announcements', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    archiveAnnouncement: (id: number) =>
      request<AdminAnnouncement>(`/api/v1/admin/announcements/${id}/archive`, {
        method: 'POST',
        body: '{}',
      }),
    restoreAnnouncement: (id: number) =>
      request<AdminAnnouncement>(`/api/v1/admin/announcements/${id}/restore`, {
        method: 'POST',
        body: '{}',
      }),
    deleteAnnouncement: (id: number) =>
      request<{ ok: boolean }>(`/api/v1/admin/announcements/${id}`, { method: 'DELETE' }),
    analytics: (path: string, query = '') =>
      request<Record<string, unknown>>(`/api/v1/admin/analytics/${path}${query}`),
  },

  bienestar: {
    stats: () => request<WellbeingStats>('/api/bienestar/estadisticas'),
    stress: (fecha?: string) => {
      const qs = fecha ? `?fecha=${encodeURIComponent(fecha)}` : '';
      return request<StressReport>(`/api/bienestar/estres${qs}`);
    },
    savePomodoro: (duracion: number) =>
      queuedLegacyMutation(
        'wellbeing.pomodoro',
        'Registrar sesión Pomodoro',
        '/api/bienestar/pomodoro',
        { duracion },
        () => applyWellbeingRecord('POMODORO', duracion),
      ),
    savePause: (tipo: string, duracion: number) =>
      queuedLegacyMutation(
        'wellbeing.pause',
        'Registrar pausa',
        '/api/bienestar/pausa',
        { tipo, duracion },
        () => applyWellbeingRecord('PAUSA', duracion, tipo),
      ),
  },
};
