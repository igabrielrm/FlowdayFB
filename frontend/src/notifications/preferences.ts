export type NotificationCategoryKey = 'activities' | 'classes' | 'chats' | 'social' | 'system';
export type NotificationPreferenceOption = {
  key: NotificationCategoryKey;
  label: string;
  description: string;
};

export type NotificationPreference = {
  enabled: boolean;
  leadMinutes?: number;
};

export type NotificationPreferences = Record<NotificationCategoryKey, NotificationPreference>;

const STORAGE_KEY = 'flowday-notification-preferences';

export const NOTIFICATION_PREFERENCE_OPTIONS: NotificationPreferenceOption[] = [
  { key: 'activities', label: 'Actividades', description: 'Recordatorios de tareas, exámenes y prioridades' },
  { key: 'classes', label: 'Clases', description: 'Inicio de clases y bloques del horario' },
  { key: 'chats', label: 'Chats', description: 'Mensajes nuevos' },
  { key: 'social', label: 'Social', description: 'Solicitudes de amistad y conexiones' },
  { key: 'system', label: 'Sistema', description: 'Anuncios y avisos importantes' },
];

const DEFAULTS: NotificationPreferences = {
  activities: { enabled: true, leadMinutes: 60 },
  classes: { enabled: true, leadMinutes: 15 },
  chats: { enabled: true },
  social: { enabled: true },
  system: { enabled: true },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function loadNotificationPreferences(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    if (!isRecord(parsed)) return { ...DEFAULTS };

    return {
      activities: {
        enabled: parsed.activities?.enabled ?? DEFAULTS.activities.enabled,
        leadMinutes: parsed.activities?.leadMinutes ?? DEFAULTS.activities.leadMinutes,
      },
      classes: {
        enabled: parsed.classes?.enabled ?? DEFAULTS.classes.enabled,
        leadMinutes: parsed.classes?.leadMinutes ?? DEFAULTS.classes.leadMinutes,
      },
      chats: {
        enabled: parsed.chats?.enabled ?? DEFAULTS.chats.enabled,
      },
      social: {
        enabled: parsed.social?.enabled ?? DEFAULTS.social.enabled,
      },
      system: {
        enabled: parsed.system?.enabled ?? DEFAULTS.system.enabled,
      },
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveNotificationPreferences(next: NotificationPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function updateNotificationPreferences(partial: Partial<NotificationPreferences>) {
  const current = loadNotificationPreferences();
  const next = { ...current, ...partial };
  saveNotificationPreferences(next);
  return next;
}

export function notificationCategoryForType(tipo?: string): NotificationCategoryKey | null {
  if (!tipo) return null;
  const normalized = tipo.toUpperCase();
  if (['ACTIVIDAD', 'PRIORIDAD', 'REAGENDAMIENTO_AUTO'].includes(normalized)) return 'activities';
  if (['HORARIO_BLOQUE', 'CLASE'].includes(normalized)) return 'classes';
  if (normalized === 'MENSAJE') return 'chats';
  if (['SOLICITUD_AMISTAD', 'CONEXION'].includes(normalized)) return 'social';
  return 'system';
}
