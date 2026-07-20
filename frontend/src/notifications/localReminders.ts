import { LocalNotifications } from '@capacitor/local-notifications';
import type { ActividadListItem } from '../types/activity';
import type { ScheduleBlock } from '../types/schedule';
import { isNative } from '../platform';
import { localDateIso, parseLocalDate, shiftLocalDateIso } from '../utils/localDate';
import { loadNotificationPreferences, notificationCategoryForType } from './preferences';
import type { NotificationPushPayload } from './types';
import { buildOccurrences } from '../utils/recurrence';

const CHANNEL_ID = 'flowday-reminders';
const PERMISSION_KEY = 'flowday-notif-permission';

function hashId(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  const id = Math.abs(hash % 2_000_000_000);
  return id === 0 ? 1 : id;
}

function atLocal(dateIso: string, hour: number, minute: number): Date {
  const date = parseLocalDate(dateIso);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function activityStart(activity: ActividadListItem): Date | null {
  if (!activity.fechaInicio) return null;
  const date = parseLocalDate(activity.fechaInicio);
  if (activity.horaInicio) {
    const [h, m] = activity.horaInicio.split(':').map(Number);
    date.setHours(h || 0, m || 0, 0, 0);
  } else {
    date.setHours(9, 0, 0, 0);
  }
  return date;
}

function nextOccurrenceOfBlock(block: ScheduleBlock, from = new Date()): Date | null {
  const [hh, mm] = block.horaInicio.split(':').map(Number);
  const targetDow = block.diaSemana; // 1=Mon … 7=Sun
  for (let offset = 0; offset < 14; offset += 1) {
    const candidate = new Date(from);
    candidate.setHours(0, 0, 0, 0);
    candidate.setDate(candidate.getDate() + offset);
    const jsDow = candidate.getDay(); // 0=Sun
    const isoDow = jsDow === 0 ? 7 : jsDow;
    if (isoDow !== targetDow) continue;
    candidate.setHours(hh || 0, mm || 0, 0, 0);
    if (candidate.getTime() > from.getTime() + 60_000) return candidate;
  }
  return null;
}

export async function ensureLocalNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') {
      localStorage.setItem(PERMISSION_KEY, 'granted');
      return true;
    }
    const requested = await LocalNotifications.requestPermissions();
    const granted = requested.display === 'granted';
    localStorage.setItem(PERMISSION_KEY, granted ? 'granted' : 'denied');
    return granted;
  } catch {
    return false;
  }
}

async function ensureChannel() {
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: 'Recordatorios Flowday',
    description: 'Clases, actividades y prioridades',
    importance: 5,
    visibility: 1,
  }).catch(() => undefined);
}

export async function maybeScheduleIncomingNotification(payload: NotificationPushPayload) {
  if (!isNative) return;
  const prefs = loadNotificationPreferences();
  const category = notificationCategoryForType(payload.tipo);
  if (!category || !prefs[category]?.enabled) return;

  const allowed = await ensureLocalNotificationPermission();
  if (!allowed) return;

  await ensureChannel();

  const notificationId = payload.id ? hashId(`push:${payload.id}`) : Date.now();
  await LocalNotifications.schedule({
    notifications: [
      {
        id: notificationId,
        title: payload.titulo || 'Nueva notificación',
        body: payload.mensaje || 'Tienes una nueva alerta en Flowday',
        schedule: { at: new Date(Date.now() + 1000), allowWhileIdle: true },
        channelId: CHANNEL_ID,
        extra: payload.enlace ? { route: payload.enlace } : undefined,
      },
    ],
  }).catch(() => undefined);
}

export async function syncLocalReminders(input: {
  activities: ActividadListItem[];
  schedule: ScheduleBlock[];
}) {
  if (!isNative) return;
  const allowed = await ensureLocalNotificationPermission();
  if (!allowed) return;
  const prefs = loadNotificationPreferences();

  await ensureChannel();

  const pending = await LocalNotifications.getPending();
  const cancelIds = pending.notifications.map((n) => ({ id: n.id }));
  if (cancelIds.length) {
    await LocalNotifications.cancel({ notifications: cancelIds }).catch(() => undefined);
  }

  const now = Date.now();
  const notifications: {
    id: number;
    title: string;
    body: string;
    schedule: { at: Date; allowWhileIdle: boolean };
    channelId: string;
    extra?: Record<string, string>;
  }[] = [];

  for (const block of input.schedule) {
    if (!prefs.classes.enabled) continue;
    const start = nextOccurrenceOfBlock(block);
    if (!start) continue;
    const remindAt = new Date(start.getTime() - (prefs.classes.leadMinutes ?? 15) * 60_000);
    if (remindAt.getTime() <= now) continue;
    notifications.push({
      id: hashId(`schedule:${block.id}:${localDateIso(start)}`),
      title: 'Clase por iniciar',
      body: `${block.materia} empieza a las ${block.horaInicio}${block.aula ? ` · ${block.aula}` : ''}`,
      schedule: { at: remindAt, allowWhileIdle: true },
      channelId: CHANNEL_ID,
      extra: { route: '/schedule' },
    });
  }

  for (const activity of input.activities) {
    if (!prefs.activities.enabled || activity.estado === 'COMPLETADA') continue;
    const baseDate = activity.fechaInicio;
    const recurrence = activity.recurrence;
    const occurrenceDates = recurrence?.enabled && baseDate
      ? buildOccurrences(recurrence.kind, recurrence.interval, baseDate, recurrence.maxOccurrences ?? 3, recurrence.endDate)
      : [baseDate].filter(Boolean) as string[];

    for (const occurrenceDate of occurrenceDates) {
      const start = activityStart({ ...activity, fechaInicio: occurrenceDate });
      if (!start) continue;

      const nearAt = new Date(start.getTime() - (prefs.activities.leadMinutes ?? 60) * 60_000);
      if (nearAt.getTime() > now) {
        notifications.push({
          id: hashId(`activity-near:${activity.id}:${occurrenceDate}`),
          title: 'Actividad próxima',
          body: `${activity.titulo} ${activity.horaInicio ? `a las ${activity.horaInicio}` : 'hoy'}`,
          schedule: { at: nearAt, allowWhileIdle: true },
          channelId: CHANNEL_ID,
          extra: { route: '/activities' },
        });
      }

      const high =
        activity.prioridad === 'ALTA'
        || activity.tipo === 'EXAMEN'
        || activity.tipo === 'DEBER';
      if (high && occurrenceDate) {
        const dayBefore = shiftLocalDateIso(occurrenceDate, -1);
        const remindAt = atLocal(dayBefore, 8, 0);
        if (remindAt.getTime() > now) {
          notifications.push({
            id: hashId(`activity-priority:${activity.id}:${occurrenceDate}`),
            title: 'Prioridad alta mañana',
            body: `Recuerda: ${activity.titulo}`,
            schedule: { at: remindAt, allowWhileIdle: true },
            channelId: CHANNEL_ID,
            extra: { route: '/activities' },
          });
        }
      }
    }
  }

  // Android limits batch size; keep the soonest reminders.
  notifications.sort((a, b) => a.schedule.at.getTime() - b.schedule.at.getTime());
  const batch = notifications.slice(0, 60);
  if (!batch.length) return;

  await LocalNotifications.schedule({ notifications: batch }).catch(() => undefined);
}
