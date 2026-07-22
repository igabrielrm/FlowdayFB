import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { firebaseClient, normalizeSnapshot } from './client';
import type { ActividadDetail, ActividadListItem } from '../types/activity';
import type { Note } from '../types/note';
import type { Profile, UpdateProfilePayload } from '../types/profile';
import type { ScheduleAlert, ScheduleBlock } from '../types/schedule';
import type { WellbeingStats, StressReport } from '../types/wellbeing';

function currentUid(): string | null {
  const user = firebaseClient.auth.currentUser;
  if (!user || user.isAnonymous) return null;
  return user.uid;
}

function requireAuthUid(): string {
  const uid = currentUid();
  if (!uid) throw new Error('No hay usuario autenticado');
  return uid;
}

// Helper para limpiar objetos antes de guardar en Firestore
function sanitizeForFirestore<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

// Función de sanitización profunda recursiva para objetos anidados
export const deepSanitizeForFirestore = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(deepSanitizeForFirestore);
  return Object.entries(obj).reduce((acc: Record<string, any>, [key, value]) => {
    if (value !== undefined) {
      acc[key] = typeof value === 'object' && value !== null
        ? deepSanitizeForFirestore(value)
        : value;
    }
    return acc;
  }, {});
};

function userDocRef(uid: string) {
  return doc(firebaseClient.firestore, 'users', uid);
}

function collectionRef(uid: string, collectionName: string) {
  return collection(firebaseClient.firestore, 'users', uid, collectionName);
}

async function ensureUserDoc(uid: string, profile: Partial<Profile> = {}) {
  const ref = userDocRef(uid);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    await setDoc(ref, {
      nombre: profile.nombre ?? 'Invitado',
      correo: profile.correo ?? null,
      telefono: profile.telefono ?? null,
      fechaNacimiento: profile.fechaNacimiento ?? null,
      genero: profile.genero ?? null,
      tema: profile.tema ?? 'dark',
      foto: profile.foto ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

function activityDocumentToList(id: string, data: any): ActividadListItem {
  return {
    id,
    titulo: String(data.titulo ?? ''),
    tipo: String(data.tipo ?? 'OTRO'),
    estado: String(data.estado ?? 'PENDIENTE'),
    materia: data.materia ?? null,
    fechaInicio: data.fechaInicio ?? null,
    horaInicio: data.horaInicio ?? null,
    duracionMinutos: data.duracionMinutos ?? null,
    prioridad: data.prioridad ?? null,
    color: data.color ?? '#5082ef',
    esPropietario: true,
    esCompartida: false,
    recurrence: data.recurrence,
    updatedAt: data.updatedAt ?? null,
  };
}

function activityDocumentToDetail(id: string, data: any): ActividadDetail {
  return {
    ...activityDocumentToList(id, data),
    descripcion: data.descripcion ?? null,
    fechaEntrega: data.fechaEntrega ?? null,
    puedeEditar: true,
    companerosIds: Array.isArray(data.companerosIds) ? data.companerosIds : [],
  };
}

// ─── LocalStorage helpers ──────────────────────────────────────

const LS_PREFIX = 'flowday_';

function lsGet<T>(key: string): T[] {
  try {
    const data = localStorage.getItem(LS_PREFIX + key);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function lsSet<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(items));
  } catch (error) {
    console.error(`Error guardando ${key} en localStorage:`, error);
  }
}

function lsFindById<T extends { id: string | number }>(items: T[], id: string | number): T | undefined {
  return items.find(item => String(item.id) === String(id));
}

function lsGetById<T extends { id: string | number }>(key: string, id: string | number): T | null {
  const items = lsGet<T>(key);
  return lsFindById(items, id) || null;
}

function lsCreate<T extends { id: string | number }>(key: string, item: T): T {
  const items = lsGet<T>(key);
  items.push(item);
  lsSet(key, items);
  return item;
}

function lsUpdate<T extends { id: string | number }>(key: string, id: string | number, patch: Partial<T>): T | null {
  const items = lsGet<T>(key);
  const index = items.findIndex(item => String(item.id) === String(id));
  if (index === -1) return null;
  items[index] = { ...items[index], ...patch, updatedAt: new Date().toISOString() };
  lsSet(key, items);
  return items[index];
}

function lsRemove<T extends { id: string | number }>(key: string, id: string | number): void {
  const items = lsGet<T>(key);
  lsSet(key, items.filter(item => String(item.id) !== String(id)));
}

function lsGenerateId(): string {
  return `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ─── Profile ───────────────────────────────────────────────────

export async function getProfile(): Promise<Profile> {
  const uid = currentUid();
  if (!uid) {
    const cached = localStorage.getItem(LS_PREFIX + 'profile');
    if (cached) return JSON.parse(cached);
    return {
      id: 'guest',
      nombre: 'Invitado',
      correo: null,
      rol: 'USER',
      telefono: null,
      fechaNacimiento: null,
      genero: null,
      tema: 'dark',
      foto: null,
    };
  }
  await ensureUserDoc(uid);
  const snapshot = await getDoc(userDocRef(uid));
  const data = snapshot.exists() ? snapshot.data() : {};
  const profile: Profile = {
    id: uid as any,
    nombre: String(data.nombre ?? 'Invitado'),
    correo: data.correo ?? null,
    rol: data.rol ?? 'USER',
    telefono: data.telefono ?? null,
    fechaNacimiento: data.fechaNacimiento ?? null,
    genero: data.genero ?? null,
    tema: data.tema ?? 'dark',
    foto: data.foto ?? null,
  };
  return profile;
}

export async function updateProfile(payload: UpdateProfilePayload): Promise<Profile> {
  const uid = currentUid();
  if (!uid) {
    const profile = await getProfile();
    const updated = { ...profile, ...payload };
    localStorage.setItem(LS_PREFIX + 'profile', JSON.stringify(updated));
    return updated;
  }
  await ensureUserDoc(uid);
  const ref = userDocRef(uid);
  await updateDoc(ref, {
    nombre: payload.nombre,
    telefono: payload.telefono ?? null,
    fechaNacimiento: payload.fechaNacimiento ?? null,
    genero: payload.genero ?? null,
    updatedAt: serverTimestamp(),
  });
  const next = await getProfile();
  return next;
}

export async function changeTheme(theme: string): Promise<Profile> {
  const uid = currentUid();
  if (!uid) {
    const profile = await getProfile();
    const updated = { ...profile, tema: theme };
    localStorage.setItem(LS_PREFIX + 'profile', JSON.stringify(updated));
    return updated;
  }
  await ensureUserDoc(uid);
  const ref = userDocRef(uid);
  await updateDoc(ref, { tema: theme, updatedAt: serverTimestamp() });
  const next = await getProfile();
  return next;
}

// ─── Activities ────────────────────────────────────────────────

export async function listActivities(): Promise<ActividadListItem[]> {
  const uid = currentUid();
  if (!uid) {
    return lsGet<ActividadListItem>('activities');
  }
  const snapshot = await getDocs(query(collectionRef(uid, 'activities'), orderBy('fechaInicio', 'asc')));
  const items = snapshot.docs.map((docSnap) => activityDocumentToList(docSnap.id, docSnap.data()));
  return items;
}

export async function getActivity(id: string): Promise<ActividadDetail | null> {
  const uid = currentUid();
  if (!uid) {
    return lsGetById<ActividadDetail>('activities', id);
  }
  const snapshot = await getDoc(doc(collectionRef(uid, 'activities'), id));
  if (!snapshot.exists()) return null;
  const detail = activityDocumentToDetail(snapshot.id, snapshot.data());
  return detail;
}

export async function listActivitiesByDate(fecha: string): Promise<ActividadListItem[]> {
  const items = await listActivities();
  const filtered = items.filter((item) => item.fechaInicio === fecha);
  return filtered;
}

export async function listActivitiesByMonth(year: number, month: number): Promise<ActividadListItem[]> {
  const items = await listActivities();
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const filtered = items.filter((item) => item.fechaInicio?.startsWith(prefix));
  return filtered;
}

export async function createActivity(payload: Partial<ActividadDetail>): Promise<ActividadDetail> {
  const uid = currentUid();
  if (!uid) {
    const newId = lsGenerateId();
    const newActivity: ActividadDetail = {
      id: newId,
      titulo: payload.titulo ?? '',
      tipo: payload.tipo ?? 'OTRO',
      estado: payload.estado ?? 'PENDIENTE',
      materia: payload.materia ?? null,
      fechaInicio: payload.fechaInicio ?? null,
      horaInicio: payload.horaInicio ?? null,
      duracionMinutos: payload.duracionMinutos ?? null,
      prioridad: payload.prioridad ?? null,
      color: payload.color ?? '#5082ef',
      descripcion: payload.descripcion ?? null,
      fechaEntrega: payload.fechaEntrega ?? null,
      esPropietario: true,
      puedeEditar: true,
      companerosIds: [],
      recurrence: payload.recurrence,
      updatedAt: new Date().toISOString(),
    };
    return lsCreate<ActividadDetail>('activities', newActivity);
  }
  const activitiesRef = collection(firebaseClient.firestore, 'users', uid, 'activities');
  const newDoc = doc(activitiesRef);
  const data = deepSanitizeForFirestore({
    ...payload,
    materia: payload.materia ?? '',
    descripcion: payload.descripcion ?? '',
    estado: payload.estado ?? 'PENDIENTE',
    esPropietario: true,
    esCompartida: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await setDoc(newDoc, data as any);
  const detail = activityDocumentToDetail(newDoc.id, data);
  return detail;
}

export async function updateActivity(id: string, payload: Partial<ActividadDetail>): Promise<ActividadDetail | null> {
  const uid = currentUid();
  if (!uid) {
    return lsUpdate<ActividadDetail>('activities', id, payload);
  }
  const ref = doc(collectionRef(uid, 'activities'), id);
  const sanitized = deepSanitizeForFirestore({ ...payload, updatedAt: serverTimestamp() });
  await updateDoc(ref, sanitized as any);
  const updated = await getActivity(id);
  return updated;
}

export async function updateActivityStatus(id: string, estado: string): Promise<ActividadListItem | null> {
  const activity = await updateActivity(id, { estado });
  return activity ? activityDocumentToList(activity.id, activity) : null;
}

export async function removeActivity(id: string): Promise<void> {
  const uid = currentUid();
  if (!uid) {
    lsRemove<ActividadDetail>('activities', id);
    return;
  }
  await deleteDoc(doc(collectionRef(uid, 'activities'), id));
}

export async function priorityAlerts(): Promise<ActividadListItem[]> {
  const activities = await listActivities();
  return activities.filter((item) => item.prioridad === 'ALTA' && item.estado !== 'COMPLETADA').slice(0, 5);
}

export async function reschedulable(): Promise<ActividadListItem[]> {
  const activities = await listActivities();
  return activities.filter((item) => item.estado === 'PENDIENTE' && item.fechaInicio != null && item.horaInicio != null).slice(0, 10);
}

export async function reschedule(id: string, fecha: string, hora?: string): Promise<ActividadDetail | null> {
  return updateActivity(id, { fechaInicio: fecha, horaInicio: hora ?? null });
}

// ─── Schedule ──────────────────────────────────────────────────

export async function listSchedule(): Promise<ScheduleBlock[]> {
  const uid = currentUid();
  if (!uid) {
    return lsGet<ScheduleBlock>('schedule');
  }
  try {
    const snapshot = await getDocs(query(collectionRef(uid, 'schedule'), orderBy('diaSemana', 'asc'), orderBy('horaInicio', 'asc')));
    const blocks = snapshot.docs.map((docSnap) => normalizeSnapshot<ScheduleBlock>(docSnap.data(), docSnap.id));
    return blocks;
  } catch (error) {
    console.error('Error al listar horario:', error);
    return [];
  }
}

export async function createScheduleBlock(payload: Omit<ScheduleBlock, 'id' | 'diaNombre'>): Promise<ScheduleBlock> {
  const uid = currentUid();
  if (!uid) {
    const newId = lsGenerateId();
    const newBlock: ScheduleBlock = {
      id: newId as any,
      materia: payload.materia,
      diaSemana: payload.diaSemana,
      diaNombre: ['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][payload.diaSemana] ?? '',
      horaInicio: payload.horaInicio,
      horaFin: payload.horaFin,
      aula: payload.aula ?? '',
      profesor: payload.profesor ?? '',
      color: payload.color ?? '#5082ef',
    };
    return lsCreate<ScheduleBlock>('schedule', newBlock);
  }
  try {
    const ref = doc(collection(firebaseClient.firestore, 'users', uid, 'schedule'));
    const data = deepSanitizeForFirestore({
      ...payload,
      aula: payload.aula ?? '',
      profesor: payload.profesor ?? '',
      diaNombre: ['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][payload.diaSemana] ?? '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(ref, data as any);
    const block = normalizeSnapshot<ScheduleBlock>(data, ref.id);
    return block;
  } catch (error) {
    console.error('Error al crear bloque de horario:', error);
    throw error;
  }
}

export async function updateScheduleBlock(id: string, payload: Partial<ScheduleBlock>): Promise<ScheduleBlock | null> {
  const uid = currentUid();
  if (!uid) {
    return lsUpdate<ScheduleBlock>('schedule', id, payload);
  }
  try {
    const ref = doc(collectionRef(uid, 'schedule'), id);
    const sanitized = deepSanitizeForFirestore({
      ...payload,
      diaNombre: payload.diaSemana ? ['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][payload.diaSemana] : undefined,
      updatedAt: serverTimestamp()
    });
    await updateDoc(ref, sanitized as any);
    const snapshot = await getDoc(ref);
    if (!snapshot.exists()) return null;
    return normalizeSnapshot<ScheduleBlock>(snapshot.data(), snapshot.id);
  } catch (error) {
    console.error('Error al actualizar bloque de horario:', error);
    throw error;
  }
}

export async function removeScheduleBlock(id: string): Promise<void> {
  const uid = currentUid();
  if (!uid) {
    lsRemove<ScheduleBlock>('schedule', id);
    return;
  }
  try {
    await deleteDoc(doc(collectionRef(uid, 'schedule'), id));
  } catch (error) {
    console.error('Error al eliminar bloque de horario:', error);
    throw error;
  }
}

/**
 * Calcula la siguiente clase activa filtrando correctamente por día y hora.
 * - Si hay una clase en curso, la retorna.
 * - Si no, busca la PRÓXIMA clase del día actual (cuya horaInicio aún no haya pasado).
 * - Si no hay más clases hoy, busca la primera del siguiente día con clases.
 */
export async function scheduleAlert(): Promise<ScheduleAlert | null> {
  try {
    const blocks = await listSchedule();
    if (blocks.length === 0) return null;

    const now = new Date();
    const today = now.getDay() === 0 ? 7 : now.getDay();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    const dayNames = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

    const active = blocks.find((block) => {
      if (block.diaSemana !== today) return false;
      const [h1, m1] = block.horaInicio.split(':').map(Number);
      const [h2, m2] = block.horaFin.split(':').map(Number);
      return currentMinutes >= h1 * 60 + m1 && currentMinutes < h2 * 60 + m2;
    });
    if (active) {
      return { ...active, enCurso: true, mensaje: 'Clase en curso ahora mismo' };
    }

    const todayFuture = blocks
      .filter((block) => {
        if (block.diaSemana !== today) return false;
        const [h1, m1] = block.horaInicio.split(':').map(Number);
        return h1 * 60 + m1 > currentMinutes;
      })
      .sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));
    if (todayFuture.length > 0) {
      const next = todayFuture[0];
      return { ...next, enCurso: false, mensaje: `Próxima clase: ${next.materia} a las ${next.horaInicio.slice(0, 5)}` };
    }

    const nextDays = blocks
      .filter((block) => block.diaSemana > today)
      .sort((a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio));
    if (nextDays.length > 0) {
      const next = nextDays[0];
      return { ...next, enCurso: false, mensaje: `Próxima clase: ${next.materia} el ${dayNames[next.diaSemana]} a las ${next.horaInicio.slice(0, 5)}` };
    }

    const nextWeek = blocks
      .filter((block) => block.diaSemana <= today)
      .sort((a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio));
    if (nextWeek.length > 0) {
      const next = nextWeek[0];
      return { ...next, enCurso: false, mensaje: `Próxima clase: ${next.materia} el ${dayNames[next.diaSemana]} (próxima semana)` };
    }

    return null;
  } catch (error) {
    console.error('Error al calcular alerta de horario:', error);
    return null;
  }
}

// ─── Notes ─────────────────────────────────────────────────────

export async function listNotes(): Promise<Note[]> {
  const uid = currentUid();
  if (!uid) {
    return lsGet<Note>('notes');
  }
  const snapshot = await getDocs(query(collectionRef(uid, 'notes'), orderBy('updatedAt', 'desc')));
  const notes = snapshot.docs.map((docSnap) => normalizeSnapshot<Note>(docSnap.data(), docSnap.id));
  return notes;
}

export async function createNote(note: Partial<Note>): Promise<Note> {
  const uid = currentUid();
  if (!uid) {
    const newId = lsGenerateId();
    const newNote: Note = {
      id: newId,
      titulo: note.titulo ?? '',
      contenido: note.contenido ?? '',
      pinned: note.pinned ?? false,
      color: note.color ?? '#ffffff',
      recurrence: note.recurrence ?? undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    return lsCreate<Note>('notes', newNote);
  }
  const ref = doc(collection(firebaseClient.firestore, 'users', uid, 'notes'));
  const data = {
    titulo: note.titulo ?? '',
    contenido: note.contenido ?? '',
    pinned: note.pinned ?? false,
    color: note.color ?? '#ffffff',
    recurrence: note.recurrence ?? undefined,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data as any);
  const created = normalizeSnapshot<Note>(data, ref.id);
  return created;
}

export async function updateNote(id: string, patch: Partial<Note>): Promise<Note | null> {
  const uid = currentUid();
  if (!uid) {
    return lsUpdate<Note>('notes', id, patch);
  }
  const ref = doc(collectionRef(uid, 'notes'), id);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() } as any);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  const note = normalizeSnapshot<Note>(snapshot.data(), snapshot.id);
  return note;
}

export async function removeNote(id: string): Promise<void> {
  const uid = currentUid();
  if (!uid) {
    lsRemove<Note>('notes', id);
    return;
  }
  await deleteDoc(doc(collectionRef(uid, 'notes'), id));
}

// ─── Wellbeing ─────────────────────────────────────────────────

export async function getWellbeingStats(): Promise<WellbeingStats> {
  const uid = currentUid();
  if (!uid) {
    const cached = localStorage.getItem(LS_PREFIX + 'wellbeing');
    if (cached) return JSON.parse(cached);
    const defaultStats: WellbeingStats = {
      minutosPomodoro: 0,
      sesionesPomodoro: 0,
      totalPomodoros: 0,
      totalPausas: 0,
      ultimasSesiones: [],
    };
    localStorage.setItem(LS_PREFIX + 'wellbeing', JSON.stringify(defaultStats));
    return defaultStats;
  }
  const ref = doc(firebaseClient.firestore, 'users', uid, 'wellbeing', 'summary');
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    const defaultStats: WellbeingStats = {
      minutosPomodoro: 0,
      sesionesPomodoro: 0,
      totalPomodoros: 0,
      totalPausas: 0,
      ultimasSesiones: [],
    };
    await setDoc(ref, { ...defaultStats, updatedAt: serverTimestamp() });
    return defaultStats;
  }
  return normalizeSnapshot<WellbeingStats>(snapshot.data(), snapshot.id);
}

export async function getStressReport(): Promise<StressReport> {
  const stats = await getWellbeingStats();
  const nivel = Math.min(100, Math.max(0, Math.round((stats.totalPausas / Math.max(1, stats.totalPomodoros)) * 50 + stats.sesionesPomodoro * 2)));
  return {
    nivel,
    factores: ['Ritmo de trabajo', 'Pausas recientes'].slice(0, 2),
    consejo: nivel >= 70 ? 'Baja el ritmo y respira profundamente.' : nivel >= 40 ? 'Mantén tu enfoque con descansos regulares.' : 'Excelente ritmo. Mantén el buen hábito.',
  };
}

export async function savePomodoro(mins: number): Promise<{ mensaje: string }> {
  const uid = currentUid();
  if (!uid) {
    const stats = await getWellbeingStats();
    const updated: WellbeingStats = {
      ...stats,
      minutosPomodoro: stats.minutosPomodoro + mins,
      sesionesPomodoro: stats.sesionesPomodoro + 1,
      totalPomodoros: stats.totalPomodoros + 1,
      ultimasSesiones: [
        ...stats.ultimasSesiones ?? [],
        { id: lsGenerateId() as any, tipo: 'POMODORO', valor: mins, descripcion: `Pomodoro de ${mins} min`, fecha: new Date().toISOString() },
      ],
    };
    localStorage.setItem(LS_PREFIX + 'wellbeing', JSON.stringify(updated));
    return { mensaje: 'Pomodoro guardado' };
  }
  const summaryRef = doc(firebaseClient.firestore, 'users', uid, 'wellbeing', 'summary');
  const entryRef = doc(collection(firebaseClient.firestore, 'users', uid, 'wellbeing', 'sessions'));
  const summary = await getWellbeingStats();
  await setDoc(entryRef, {
    tipo: 'POMODORO',
    valor: mins,
    descripcion: `Pomodoro de ${mins} min`,
    fecha: new Date().toISOString(),
    createdAt: serverTimestamp(),
  });
  await updateDoc(summaryRef, {
    minutosPomodoro: summary.minutosPomodoro + mins,
    sesionesPomodoro: summary.sesionesPomodoro + 1,
    totalPomodoros: summary.totalPomodoros + 1,
    updatedAt: serverTimestamp(),
  } as any);
  return { mensaje: 'Pomodoro guardado' };
}

export async function savePause(tipo: string, mins: number): Promise<{ mensaje: string }> {
  const uid = currentUid();
  if (!uid) {
    const stats = await getWellbeingStats();
    const updated: WellbeingStats = {
      ...stats,
      totalPausas: stats.totalPausas + 1,
      ultimasSesiones: [
        ...stats.ultimasSesiones ?? [],
        { id: lsGenerateId() as any, tipo, valor: mins, descripcion: `Pausa de ${mins} min`, fecha: new Date().toISOString() },
      ],
    };
    localStorage.setItem(LS_PREFIX + 'wellbeing', JSON.stringify(updated));
    return { mensaje: 'Pausa registrada' };
  }
  const summaryRef = doc(firebaseClient.firestore, 'users', uid, 'wellbeing', 'summary');
  const summary = await getWellbeingStats();
  await setDoc(doc(collection(firebaseClient.firestore, 'users', uid, 'wellbeing', 'pauses')), {
    tipo,
    valor: mins,
    descripcion: `Pausa de ${mins} min`,
    fecha: new Date().toISOString(),
    createdAt: serverTimestamp(),
  } as any);
  await updateDoc(summaryRef, {
    totalPausas: summary.totalPausas + 1,
    updatedAt: serverTimestamp(),
  } as any);
  return { mensaje: 'Pausa registrada' };
}

export async function unreadNotificationCount(): Promise<{ count: number }> {
  return { count: 0 };
}

export async function listNotifications(): Promise<any[]> {
  return [];
}

export async function markNotificationRead(): Promise<{ ok: boolean; count: number }> {
  return { ok: true, count: 0 };
}

export async function markAllNotificationsRead(): Promise<{ ok: boolean; count: number }> {
  return { ok: true, count: 0 };
}

export async function isMobileCompatible(): Promise<boolean> {
  return true;
}