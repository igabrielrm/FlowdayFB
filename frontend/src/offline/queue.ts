const QUEUE_KEY = 'flowday-offline-queue';
const TEMP_ID_KEY = 'flowday-offline-temp-id';

export type OfflineMutationKind =
  | 'activity.create'
  | 'activity.update'
  | 'activity.delete'
  | 'activity.status'
  | 'activity.reschedule'
  | 'schedule.create'
  | 'schedule.update'
  | 'schedule.delete';

export type OfflineMutation = {
  id: string;
  kind: OfflineMutationKind;
  label: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: string;
  entityId?: number;
  tempId?: number;
  createdAt: number;
};

function readRaw(): OfflineMutation[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(items: OfflineMutation[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
  } catch {
    /* quota */
  }
}

export function readQueue(): OfflineMutation[] {
  return readRaw().sort((a, b) => a.createdAt - b.createdAt);
}

export function pendingCount(): number {
  return readRaw().length;
}

export function allocateTempId(): number {
  try {
    const current = Number(localStorage.getItem(TEMP_ID_KEY) || '0');
    const next = current - 1;
    localStorage.setItem(TEMP_ID_KEY, String(next));
    return next;
  } catch {
    return -Date.now();
  }
}

export function enqueue(
  mutation: Omit<OfflineMutation, 'id' | 'createdAt'>,
): OfflineMutation {
  const entry: OfflineMutation = {
    ...mutation,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  writeRaw([...readRaw(), entry]);
  return entry;
}

export function removeFromQueue(id: string) {
  writeRaw(readRaw().filter((item) => item.id !== id));
}

export function remapTempId(tempId: number, realId: number) {
  const updated = readRaw().map((item) => {
    let path = item.path;
    let entityId = item.entityId;
    let itemTempId = item.tempId;

    if (item.entityId === tempId) entityId = realId;
    if (item.tempId === tempId) itemTempId = realId;

    path = path.replace(`/activities/${tempId}`, `/activities/${realId}`);
    path = path.replace(`/schedule/blocks/${tempId}`, `/schedule/blocks/${realId}`);

    if (item.body) {
      try {
        const parsed = JSON.parse(item.body) as Record<string, unknown>;
        let changed = false;
        for (const key of Object.keys(parsed)) {
          if (parsed[key] === tempId) {
            parsed[key] = realId;
            changed = true;
          }
        }
        if (changed) {
          return { ...item, path, entityId, tempId: itemTempId, body: JSON.stringify(parsed) };
        }
      } catch {
        /* ignore */
      }
    }

    return { ...item, path, entityId, tempId: itemTempId };
  });
  writeRaw(updated);
}
