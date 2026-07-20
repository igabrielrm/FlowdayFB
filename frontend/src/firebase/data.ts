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

function currentUid() {
  const user = firebaseClient.auth.currentUser;
  if (!user) throw new Error('No hay usuario autenticado');
  return user.uid;
}

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

export async function getProfile(): Promise<Profile> {
  const uid = currentUid();
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
  await ensureUserDoc(uid);
  const ref = userDocRef(uid);
  await updateDoc(ref, { tema: theme, updatedAt: serverTimestamp() });
  const next = await getProfile();
  return next;
}

export async function listActivities(): Promise<ActividadListItem[]> {
  const uid = currentUid();
  const snapshot = await getDocs(query(collectionRef(uid, 'activities'), orderBy('fechaInicio', 'asc')));
  const items = snapshot.docs.map((docSnap) => activityDocumentToList(docSnap.id, docSnap.data()));
  return items;
}

export async function getActivity(id: string): Promise<ActividadDetail | null> {
  const uid = currentUid();
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
  const activitiesRef = collection(firebaseClient.firestore, 'users', uid, 'activities');
  const newDoc = doc(activitiesRef);
  const data = {
    ...payload,
    estado: payload.estado ?? 'PENDIENTE',
    esPropietario: true,
    esCompartida: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(newDoc, data as any);
  const detail = activityDocumentToDetail(newDoc.id, data);
  return detail;
}

export async function updateActivity(id: string, payload: Partial<ActividadDetail>): Promise<ActividadDetail | null> {
  const uid = currentUid();
  const ref = doc(collectionRef(uid, 'activities'), id);
  await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() } as any);
  const updated = await getActivity(id);
  return updated;
}

export async function updateActivityStatus(id: string, estado: string): Promise<ActividadListItem | null> {
  const activity = await updateActivity(id, { estado });
  return activity ? activityDocumentToList(activity.id, activity) : null;
}

export async function removeActivity(id: string): Promise<void> {
  const uid = currentUid();
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

export async function listSchedule(): Promise<ScheduleBlock[]> {
  const uid = currentUid();
  const snapshot = await getDocs(query(collectionRef(uid, 'schedule'), orderBy('diaSemana', 'asc'), orderBy('horaInicio', 'asc')));
  const blocks = snapshot.docs.map((docSnap) => normalizeSnapshot<ScheduleBlock>(docSnap.data(), docSnap.id));
  return blocks;
}

export async function createScheduleBlock(payload: Omit<ScheduleBlock, 'id' | 'diaNombre'>): Promise<ScheduleBlock> {
  const uid = currentUid();
  const ref = doc(collection(firebaseClient.firestore, 'users', uid, 'schedule'));
  const data = {
    ...payload,
    diaNombre: ['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][payload.diaSemana] ?? '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data as any);
  const block = normalizeSnapshot<ScheduleBlock>(data, ref.id);
  return block;
}

export async function updateScheduleBlock(id: string, payload: Partial<ScheduleBlock>): Promise<ScheduleBlock | null> {
  const uid = currentUid();
  const ref = doc(collectionRef(uid, 'schedule'), id);
  await updateDoc(ref, { ...payload, diaNombre: payload.diaSemana ? ['','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'][payload.diaSemana] : undefined, updatedAt: serverTimestamp() } as any);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  return normalizeSnapshot<ScheduleBlock>(snapshot.data(), snapshot.id);
}

export async function removeScheduleBlock(id: string): Promise<void> {
  const uid = currentUid();
  await deleteDoc(doc(collectionRef(uid, 'schedule'), id));
}

export async function scheduleAlert(): Promise<ScheduleAlert | null> {
  const blocks = await listSchedule();
  const now = new Date();
  const today = now.getDay() === 0 ? 7 : now.getDay();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const active = blocks.find((block) => block.diaSemana === today && (() => {
    const [h1, m1] = block.horaInicio.split(':').map(Number);
    const [h2, m2] = block.horaFin.split(':').map(Number);
    const start = h1 * 60 + m1;
    const end = h2 * 60 + m2;
    return currentMinutes >= start && currentMinutes < end;
  })());
  if (active) {
    return { ...active, enCurso: true, mensaje: 'Clase en curso ahora mismo' };
  }
  const next = blocks
    .filter((block) => block.diaSemana >= today)
    .sort((a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio))[0];
  if (!next) return null;
  return { ...next, enCurso: false, mensaje: `Próxima clase: ${next.materia}` };
}

export async function listNotes(): Promise<Note[]> {
  const uid = currentUid();
  const snapshot = await getDocs(query(collectionRef(uid, 'notes'), orderBy('updatedAt', 'desc')));
  const notes = snapshot.docs.map((docSnap) => normalizeSnapshot<Note>(docSnap.data(), docSnap.id));
  return notes;
}

export async function createNote(note: Partial<Note>): Promise<Note> {
  const uid = currentUid();
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
  const ref = doc(collectionRef(uid, 'notes'), id);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() } as any);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) return null;
  const note = normalizeSnapshot<Note>(snapshot.data(), snapshot.id);
  return note;
}

export async function removeNote(id: string): Promise<void> {
  const uid = currentUid();
  await deleteDoc(doc(collectionRef(uid, 'notes'), id));
}

export async function getWellbeingStats(): Promise<WellbeingStats> {
  const uid = currentUid();
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