import type { ActividadDetail } from '../types/activity';
import type { ScheduleBlock } from '../types/schedule';
import type { Note } from '../types/note';
import { cacheApiGet } from './cache';
import {
  applyActivityCreate,
  applyActivityDelete,
  applyActivityReschedule,
  applyActivityStatus,
  applyActivityUpdate,
  applyScheduleCreate,
  applyScheduleDelete,
  applyScheduleUpdate,
  replaceActivityTempId,
  replaceScheduleTempId,
  applyNoteCreate,
  applyNoteUpdate,
  applyNoteDelete,
} from './optimistic';
import {
  type OfflineMutation,
  readQueue,
  remapTempId,
  removeFromQueue,
  updateMutation,
  updateEntityVersion,
} from './queue';
import { notifyOfflineQueueChanged } from '../events';
import { nativeAuthorizedFetch } from '../auth/nativeAuth';
import { cacheSessionUser } from './cache';
import { replaceChatTempId } from './domainOptimistic';
import type { Profile } from '../types/profile';
import type { ChatMessage } from '../types/chat';

export type SyncResult = {
  synced: number;
  failed: number;
  errors: string[];
};

type ApiResponse<T> = {
  ok: boolean;
  data: T | null;
  error: string | null;
};

type MutationResponse = ApiResponse<unknown> & { status?: number };

const DEVICE_ID_KEY = 'flowday-device-id';

function deviceId() {
  let value = localStorage.getItem(DEVICE_ID_KEY);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, value);
  }
  return value;
}

function syncPayload(mutation: OfflineMutation) {
  let payload: Record<string, unknown> = {};
  if (mutation.body) {
    try {
      payload = JSON.parse(mutation.body) as Record<string, unknown>;
    } catch {
      payload = {};
    }
  }
  if (mutation.entityId != null && mutation.entityId > 0) {
    if (mutation.kind.startsWith('community.')) payload.connectionId ??= mutation.entityId;
    else if (mutation.kind === 'chat.read' || mutation.kind === 'chat.delete') {
      payload.userId ??= mutation.entityId;
    } else payload.id ??= mutation.entityId;
  }
  return payload;
}

async function executeMutation(mutation: OfflineMutation): Promise<MutationResponse> {
  const res = await nativeAuthorizedFetch('/api/v1/sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      deviceId: deviceId(),
      operations: [{
        operationId: mutation.id,
        kind: mutation.kind,
        expectedVersion: mutation.expectedVersion ?? null,
        payload: syncPayload(mutation),
        localEntityId: mutation.tempId != null ? String(mutation.tempId) : null,
      }],
    }),
  });
  if (res.status === 401) {
    return { ok: false, data: null, error: 'Sesión expirada', status: 401 };
  }
  if (res.status === 404) {
    return {
      ok: false,
      data: null,
      error: 'El backend publicado todavía no incluye la sincronización offline.',
      status: 503,
    };
  }
  if (!res.ok) {
    return { ok: false, data: null, error: `Error de sincronización (${res.status})`, status: res.status };
  }
  const json = (await res.json()) as {
    results?: Array<{
      status: 'APPLIED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';
      data?: unknown;
      error?: string | null;
    }>;
  };
  const result = json.results?.[0];
  if (!result) {
    return { ok: false, data: null, error: 'Respuesta de sincronización inválida', status: 502 };
  }
  if (result.status === 'APPLIED' || result.status === 'DUPLICATE') {
    return { ok: true, data: result.data ?? null, error: null, status: 200 };
  }
  return {
    ok: false,
    data: result.data ?? null,
    error:
      result.error
      || (result.status === 'CONFLICT'
        ? 'La información cambió en el servidor.'
        : 'Operación rechazada.'),
    status: result.status === 'CONFLICT' ? 409 : 422,
  };
}

async function applyServerResult(mutation: OfflineMutation, data: unknown) {
  switch (mutation.kind) {
    case 'activity.create': {
      const detail = data as ActividadDetail;
      if (mutation.tempId != null && detail?.id) {
        replaceActivityTempId(mutation.tempId, detail.id, detail);
        await remapTempId(mutation.tempId, detail.id);
      } else if (detail) {
        applyActivityCreate(detail);
      }
      break;
    }
    case 'activity.update': {
      const detail = data as ActividadDetail;
      if (detail) {
        cacheApiGet(`/api/v1/activities/${detail.id}`, detail);
        applyActivityUpdate(detail.id, detail);
      }
      break;
    }
    case 'activity.delete':
      if (mutation.entityId != null) applyActivityDelete(mutation.entityId);
      break;
    case 'activity.status': {
      const item = data as { id?: number; estado?: string };
      if (item?.id && item.estado) applyActivityStatus(item.id, item.estado);
      break;
    }
    case 'activity.reschedule': {
      const detail = data as ActividadDetail;
      if (detail?.id) {
        cacheApiGet(`/api/v1/activities/${detail.id}`, detail);
        applyActivityReschedule(detail.id, detail.fechaInicio ?? '', detail.horaInicio);
      }
      break;
    }
    case 'schedule.create': {
      const block = data as ScheduleBlock;
      if (mutation.tempId != null && block?.id) {
        replaceScheduleTempId(mutation.tempId, block.id, block);
        await remapTempId(mutation.tempId, block.id);
      } else if (block) {
        applyScheduleCreate(block);
      }
      break;
    }
    case 'schedule.update': {
      const block = data as ScheduleBlock;
      if (block) applyScheduleUpdate(block.id, block);
      break;
    }
    case 'schedule.delete':
      if (mutation.entityId != null) applyScheduleDelete(mutation.entityId);
      break;
    case 'profile.update':
    case 'profile.theme': {
      const profile = data as Profile;
      if (profile?.id) {
        cacheApiGet('/api/v1/profile', profile);
        cacheSessionUser(profile);
      }
      break;
    }
    case 'chat.send': {
      const message = data as ChatMessage;
      if (mutation.tempId != null && message?.id) {
        replaceChatTempId(mutation.tempId, message);
      }
      break;
    }
    case 'note.create': {
      const note = data as Note;
      if (note) {
        applyNoteCreate(note);
      }
      break;
    }
    case 'note.update': {
      const note = data as Note;
      if (note) {
        applyNoteUpdate(note.id, note);
        cacheApiGet(`/api/v1/notes/${note.id}`, note);
      }
      break;
    }
    case 'note.delete':
      if (mutation.entityId) {
        applyNoteDelete(String(mutation.entityId));
      }
      break;
    default:
      break;
  }
}

let flushing = false;

export function isFlushingQueue() {
  return flushing;
}

export async function flushOfflineQueue(): Promise<SyncResult> {
  if (flushing || !navigator.onLine) {
    return { synced: 0, failed: 0, errors: [] };
  }

  flushing = true;
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };

  try {
    const initial = await readQueue(true);
    await Promise.all(
      initial
        .filter((item) => item.status === 'SYNCING')
        .map((item) => updateMutation(item.id, { status: 'PENDING' })),
    );
    const processed = new Set<string>();
    while (true) {
      const queue = await readQueue();
      const mutation = queue.find(
        (item) =>
          !processed.has(item.id)
          && (item.dependsOn ?? []).every(
            (dependency) => !queue.some((queued) => queued.id === dependency),
          ),
      );
      if (!mutation) break;
      processed.add(mutation.id);
      try {
        await updateMutation(mutation.id, {
          status: 'SYNCING',
          attempts: mutation.attempts + 1,
          lastError: undefined,
        });
        const response = await executeMutation(mutation);
        if (!response.ok) {
          result.failed += 1;
          result.errors.push(response.error || `No se pudo sincronizar: ${mutation.label}`);
          if (response.status === 401) {
            await updateMutation(mutation.id, { status: 'PENDING', lastError: response.error ?? undefined });
            break;
          }
          if ((response.status ?? 0) >= 500) {
            await updateMutation(mutation.id, { status: 'PENDING', lastError: response.error ?? undefined });
            break;
          }
          await updateMutation(mutation.id, {
            status: response.status === 409 ? 'CONFLICT' : 'FAILED',
            lastError: response.error ?? undefined,
            serverData: response.data,
          });
          continue;
        }
        await removeFromQueue(mutation.id);
        if (response.data != null) {
          await applyServerResult(mutation, response.data);
          const version = (response.data as { version?: number }).version;
          const canonicalId =
            (response.data as { id?: number }).id
            ?? (mutation.entityId != null && mutation.entityId > 0 ? mutation.entityId : undefined);
          if (canonicalId != null && version != null) {
            await updateEntityVersion(canonicalId, version);
          }
        } else if (mutation.kind === 'activity.delete' || mutation.kind === 'schedule.delete') {
          await applyServerResult(mutation, null);
        }
        result.synced += 1;
        notifyOfflineQueueChanged();
      } catch {
        result.failed += 1;
        result.errors.push(`Error de red al sincronizar: ${mutation.label}`);
        await updateMutation(mutation.id, { status: 'PENDING', lastError: 'Error de red' });
        break;
      }
    }
  } finally {
    flushing = false;
    notifyOfflineQueueChanged();
  }

  return result;
}
