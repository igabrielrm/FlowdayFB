import type { ActividadDetail } from '../types/activity';
import type { ScheduleBlock } from '../types/schedule';
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
} from './optimistic';
import {
  type OfflineMutation,
  readQueue,
  remapTempId,
  removeFromQueue,
} from './queue';
import { notifyOfflineQueueChanged } from '../events';

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

const API_BASE = '';

async function executeMutation(mutation: OfflineMutation): Promise<ApiResponse<unknown>> {
  const res = await fetch(`${API_BASE}${mutation.path}`, {
    method: mutation.method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: mutation.body,
  });
  if (res.status === 401) {
    return { ok: false, data: null, error: 'Sesión expirada' };
  }
  if (res.status === 204) {
    return { ok: true, data: null, error: null };
  }
  return (await res.json()) as ApiResponse<unknown>;
}

function applyServerResult(mutation: OfflineMutation, data: unknown) {
  switch (mutation.kind) {
    case 'activity.create': {
      const detail = data as ActividadDetail;
      if (mutation.tempId != null && detail?.id) {
        replaceActivityTempId(mutation.tempId, detail.id, detail);
        remapTempId(mutation.tempId, detail.id);
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
        remapTempId(mutation.tempId, block.id);
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
    const queue = readQueue();
    for (const mutation of queue) {
      try {
        const response = await executeMutation(mutation);
        if (!response.ok) {
          result.failed += 1;
          result.errors.push(response.error || `No se pudo sincronizar: ${mutation.label}`);
          break;
        }
        removeFromQueue(mutation.id);
        if (response.data != null) {
          applyServerResult(mutation, response.data);
        } else if (mutation.kind === 'activity.delete' || mutation.kind === 'schedule.delete') {
          applyServerResult(mutation, null);
        }
        result.synced += 1;
        notifyOfflineQueueChanged();
      } catch {
        result.failed += 1;
        result.errors.push(`Error de red al sincronizar: ${mutation.label}`);
        break;
      }
    }
  } finally {
    flushing = false;
    notifyOfflineQueueChanged();
  }

  return result;
}
