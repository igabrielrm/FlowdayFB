import { readSessionUser } from './cache';
import { dbDelete, dbGet, dbGetAll, dbPut } from './db';

const LEGACY_QUEUE_KEY = 'flowday-offline-queue';
const TEMP_ID_KEY = 'flowday-offline-temp-id';

export type OfflineMutationKind =
  | 'activity.create'
  | 'activity.update'
  | 'activity.delete'
  | 'activity.status'
  | 'activity.reschedule'
  | 'schedule.create'
  | 'schedule.update'
  | 'schedule.delete'
  | 'note.create'
  | 'note.update'
  | 'note.delete'
  | 'profile.update'
  | 'profile.theme'
  | 'wellbeing.pomodoro'
  | 'wellbeing.pause'
  | 'community.connect'
  | 'community.accept'
  | 'community.reject'
  | 'community.remove'
  | 'chat.send'
  | 'chat.read'
  | 'chat.delete'
  | 'notification.read'
  | 'notification.readAll'
  | 'notification.delete';

export type OfflineMutationStatus = 'PENDING' | 'SYNCING' | 'CONFLICT' | 'FAILED';

export type OfflineMutation = {
  id: string;
  userId: string;
  kind: OfflineMutationKind;
  label: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body?: string;
  entityId?: number | string;
  tempId?: number;
  createdAt: number;
  status: OfflineMutationStatus;
  attempts: number;
  dependsOn?: string[];
  expectedVersion?: number;
  lastError?: string;
  serverData?: unknown;
};

export function currentOfflineUserId() {
  return String(readSessionUser()?.id ?? 'anonymous');
}

async function ensureMigrated(userId: string) {
  const marker = `legacy-outbox-migrated:${userId}`;
  if (await dbGet('meta', marker)) return;
  try {
    const raw = localStorage.getItem(LEGACY_QUEUE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<OfflineMutation>[]) : [];
    for (const item of parsed) {
      if (!item.id || !item.kind || !item.path || !item.method) continue;
      await dbPut('outbox', {
        ...item,
        userId,
        status: 'PENDING' as const,
        attempts: 0,
        createdAt: item.createdAt ?? Date.now(),
      } as OfflineMutation);
    }
    localStorage.removeItem(LEGACY_QUEUE_KEY);
  } catch {
    // A malformed legacy queue is ignored.
  }
  await dbPut('meta', { id: marker, migratedAt: Date.now() });
}

export async function readQueue(includeResolved = false): Promise<OfflineMutation[]> {
  const userId = currentOfflineUserId();
  await ensureMigrated(userId);
  const all = await dbGetAll<OfflineMutation>('outbox');
  return all
    .filter((item) => item.userId === userId)
    .filter((item) => includeResolved || item.status === 'PENDING' || item.status === 'SYNCING')
    .sort((a, b) => a.createdAt - b.createdAt);
}

export async function pendingCount(): Promise<number> {
  const userId = currentOfflineUserId();
  await ensureMigrated(userId);
  const all = await dbGetAll<OfflineMutation>('outbox');
  return all.filter((item) => item.userId === userId).length;
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

export async function enqueue(
  mutation: Omit<OfflineMutation, 'id' | 'createdAt' | 'userId' | 'status' | 'attempts'>
    & Partial<Pick<OfflineMutation, 'status' | 'attempts'>>
    & { noteId?: string },
): Promise<OfflineMutation | null> {
  const userId = currentOfflineUserId();
  await ensureMigrated(userId);
  const existing = await readQueue(true);

  // Note mutations use string UUIDs — skip numeric temp-id compaction logic for them
  if (mutation.kind.startsWith('note.')) {
    const entry: OfflineMutation = {
      ...mutation,
      id: crypto.randomUUID(),
      userId,
      createdAt: Date.now(),
      status: mutation.status ?? 'PENDING',
      attempts: mutation.attempts ?? 0,
    };
    // Supersede same-kind + same-entity note mutations
    const superseded = existing.find(
      (item) =>
        item.kind === mutation.kind &&
        item.entityId != null &&
        item.entityId === mutation.entityId &&
        item.status !== 'SYNCING',
    );
    if (superseded) await dbDelete('outbox', superseded.id);
    await dbPut('outbox', entry);
    return entry;
  }

  if (mutation.entityId != null && typeof mutation.entityId === 'number' && mutation.entityId < 0 && !mutation.kind.endsWith('.create')) {
    const creation = existing.find(
      (item) => item.tempId === mutation.entityId && item.kind.endsWith('.create'),
    );
    const canMergeIntoCreate =
      mutation.kind.endsWith('.update') || mutation.kind === 'activity.reschedule';
    if (creation && canMergeIntoCreate && mutation.body) {
      try {
        const original = creation.body ? JSON.parse(creation.body) as Record<string, unknown> : {};
        const patch = JSON.parse(mutation.body) as Record<string, unknown>;
        const merged =
          mutation.kind === 'activity.reschedule'
            ? { ...original, fechaInicio: patch.fecha, horaInicio: patch.hora }
            : { ...original, ...patch };
        const compacted = { ...creation, body: JSON.stringify(merged), createdAt: Date.now() };
        await dbPut('outbox', compacted);
        return compacted;
      } catch {
        // Keep both operations when their payload cannot be compacted safely.
      }
    }
  }

  if (mutation.entityId != null && typeof mutation.entityId === 'number' && mutation.entityId < 0 && mutation.kind.endsWith('.delete')) {
    const creation = existing.find(
      (item) => item.tempId === mutation.entityId && item.kind.endsWith('.create'),
    );
    if (creation) {
      await Promise.all(
        existing
          .filter((item) => item.entityId === mutation.entityId || item.tempId === mutation.entityId)
          .map((item) => dbDelete('outbox', item.id)),
      );
      return null;
    }
  }

  const superseded = existing.find(
    (item) =>
      item.kind === mutation.kind
      && item.entityId != null
      && item.entityId === mutation.entityId
      && item.status !== 'SYNCING',
  );
  if (superseded) await dbDelete('outbox', superseded.id);

  const parentCreation =
    mutation.entityId != null && typeof mutation.entityId === 'number' && mutation.entityId < 0
      ? existing.find((item) => item.tempId === mutation.entityId && item.kind.endsWith('.create'))
      : undefined;

  const entry: OfflineMutation = {
    ...mutation,
    id: crypto.randomUUID(),
    userId,
    createdAt: Date.now(),
    status: mutation.status ?? 'PENDING',
    attempts: mutation.attempts ?? 0,
    dependsOn: mutation.dependsOn ?? (parentCreation ? [parentCreation.id] : undefined),
  };
  await dbPut('outbox', entry);
  return entry;
}

export function removeFromQueue(id: string) {
  return dbDelete('outbox', id);
}

function remapValue(value: unknown, tempId: number, realId: number): unknown {
  if (value === tempId) return realId;
  if (Array.isArray(value)) return value.map((item) => remapValue(item, tempId, realId));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, remapValue(item, tempId, realId)]),
    );
  }
  return value;
}

export async function remapTempId(tempId: number, realId: number) {
  const current = await readQueue(true);
  const updated = current.map((item) => {
    let path = item.path;
    let entityId = item.entityId;
    let itemTempId = item.tempId;

    if (item.entityId === tempId) entityId = realId;
    if (item.tempId === tempId) itemTempId = realId;

    path = path.replace(`/activities/${tempId}`, `/activities/${realId}`);
    path = path.replace(`/schedule/blocks/${tempId}`, `/schedule/blocks/${realId}`);

    if (item.body) {
      try {
        const parsed = remapValue(JSON.parse(item.body), tempId, realId);
        return { ...item, path, entityId, tempId: itemTempId, body: JSON.stringify(parsed) };
      } catch {
        /* ignore */
      }
    }

    return { ...item, path, entityId, tempId: itemTempId };
  });
  await Promise.all(updated.map((item) => dbPut('outbox', item)));
}

export async function updateMutation(
  id: string,
  patch: Partial<
    Pick<OfflineMutation, 'status' | 'attempts' | 'lastError' | 'serverData' | 'expectedVersion'>
  >,
) {
  const current = await dbGet<OfflineMutation>('outbox', id);
  if (current) await dbPut('outbox', { ...current, ...patch });
}

export async function updateEntityVersion(entityId: number, expectedVersion: number) {
  const current = await readQueue(true);
  await Promise.all(
    current
      .filter((item) => item.entityId === entityId && item.status !== 'CONFLICT')
      .map((item) => dbPut('outbox', { ...item, expectedVersion })),
  );
}

export async function discardUserOutbox(userId = currentOfflineUserId()) {
  const all = await dbGetAll<OfflineMutation>('outbox');
  await Promise.all(
    all.filter((item) => item.userId === userId).map((item) => dbDelete('outbox', item.id)),
  );
}
