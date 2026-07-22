import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  onSnapshot,
  type Unsubscribe,
  type DocumentData,
} from 'firebase/firestore';
import { firebaseClient } from './client';
import { deepSanitizeForFirestore } from './data';
import type { ActividadDetail, ActividadListItem } from '../types/activity';

// Función modificada para soportar modo invitado
function currentUid(): string | null {
  const user = firebaseClient.auth.currentUser;
  if (!user) return null; // Modo invitado - no lanzar error
  return user.uid;
}

// Función para obtener UID para operaciones que requieren usuario autenticado
function requireAuthUid(): string {
  const user = firebaseClient.auth.currentUser;
  if (!user) throw new Error('No hay usuario autenticado');
  return user.uid;
}

function activityDocumentToList(id: string, data: any, uid: string): ActividadListItem {
  const esPropietario = data.propietarioId === uid;
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
    esPropietario,
    esCompartida: Array.isArray(data.compartidoCon) && data.compartidoCon.length > 0,
    recurrence: data.recurrence,
    updatedAt: data.updatedAt ?? null,
  };
}

function activityDocumentToDetail(id: string, data: any, uid: string): ActividadDetail {
  return {
    ...activityDocumentToList(id, data, uid),
    descripcion: data.descripcion ?? null,
    fechaEntrega: data.fechaEntrega ?? null,
    puedeEditar: data.propietarioId === uid || (Array.isArray(data.compartidoCon) && data.compartidoCon.includes(uid)),
    companerosIds: Array.isArray(data.companerosIds) ? data.companerosIds : [],
  };
}

// ─── Own activities (existing behavior) ──────────────────────
export async function listOwnActivities(uid: string): Promise<ActividadListItem[]> {
  try {
    const snapshot = await getDocs(
      query(
        collection(firebaseClient.firestore, 'users', uid, 'activities'),
        orderBy('fechaInicio', 'asc'),
      ),
    );
    return snapshot.docs.map((docSnap) =>
      activityDocumentToList(docSnap.id, docSnap.data(), uid),
    );
  } catch (error) {
    console.error('Error al listar actividades:', error);
    return [];
  }
}

export async function getOwnActivity(uid: string, id: string): Promise<ActividadDetail | null> {
  try {
    const snapshot = await getDoc(doc(firebaseClient.firestore, 'users', uid, 'activities', id));
    if (!snapshot.exists()) return null;
    return activityDocumentToDetail(snapshot.id, snapshot.data(), uid);
  } catch (error) {
    console.error('Error al obtener actividad:', error);
    return null;
  }
}

// ─── Create activity with compartidoCon ─────────────────────
export async function createActivity(
  payload: Partial<ActividadDetail> & { compartidoCon?: string[] },
): Promise<ActividadDetail> {
  const uid = currentUid();
  
  // Modo invitado: almacenar en localStorage
  if (!uid) {
    return createActivityForGuest(payload);
  }
  const activitiesRef = collection(firebaseClient.firestore, 'users', uid, 'activities');
  const newDoc = doc(activitiesRef);

  const compartidoCon = Array.isArray(payload.compartidoCon) ? payload.compartidoCon : [];

  const data = deepSanitizeForFirestore({
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
    propietarioId: uid,
    propietarioNombre: firebaseClient.auth.currentUser?.displayName ?? 'Usuario',
    compartidoCon,
    esCompartida: compartidoCon.length > 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await setDoc(newDoc, data as any);

  // If shared, also add to shared collections
  if (compartidoCon.length > 0) {
    await Promise.all(
      compartidoCon.map((targetUid) =>
        setDoc(doc(firebaseClient.firestore, 'users', targetUid, 'sharedActivities', newDoc.id), {
          ...data,
          propietarioUid: uid,
          actividadId: newDoc.id,
        } as any),
      ),
    );
  }

  return activityDocumentToDetail(newDoc.id, data, uid);
}

// ─── Update activity with compartidoCon ─────────────────────
export async function updateActivity(
  id: string,
  payload: Partial<ActividadDetail & { compartidoCon?: string[] }>,
): Promise<ActividadDetail | null> {
  const uid = currentUid();
  
  // Modo invitado: actualizar en localStorage
  if (!uid) {
    return updateActivityForGuest(id, payload);
  }
  const ref = doc(firebaseClient.firestore, 'users', uid, 'activities', id);

  const updateData = deepSanitizeForFirestore({ ...payload, updatedAt: serverTimestamp() });
  await updateDoc(ref, updateData as any);

  // Update shared copies
  const currentSnap = await getDoc(ref);
  if (currentSnap.exists()) {
    const currentData = currentSnap.data();
    const compartidoCon: string[] = currentData.compartidoCon ?? [];
    if (compartidoCon.length > 0) {
      await Promise.all(
        compartidoCon.map((targetUid: string) =>
          setDoc(
            doc(firebaseClient.firestore, 'users', targetUid, 'sharedActivities', id),
            { ...updateData, propietarioUid: uid, actividadId: id } as any,
            { merge: true },
          ),
        ),
      );
    }
  }

  return getOwnActivity(uid, id);
}

// ─── Delete activity and its shared copies ──────────────────
export async function removeActivity(id: string): Promise<void> {
  const uid = currentUid();
  
  // Modo invitado: eliminar de localStorage
  if (!uid) {
    removeActivityForGuest(id);
    return;
  }
  const ref = doc(firebaseClient.firestore, 'users', uid, 'activities', id);

  // Get shared users before deleting
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const data = snap.data();
    const compartidoCon: string[] = data.compartidoCon ?? [];
    if (compartidoCon.length > 0) {
      await Promise.all(
        compartidoCon.map((targetUid: string) =>
          deleteDoc(doc(firebaseClient.firestore, 'users', targetUid, 'sharedActivities', id)),
        ),
      );
    }
  }

  await deleteDoc(ref);
}

// ─── Get shared activities (received from friends) ──────────
export async function getSharedActivities(): Promise<ActividadListItem[]> {
  const uid = currentUid();
  try {
    const snapshot = await getDocs(
      query(
        collection(firebaseClient.firestore, 'users', uid, 'sharedActivities'),
      ),
    );
    return snapshot.docs.map((docSnap) =>
      activityDocumentToList(docSnap.id, docSnap.data(), uid),
    );
  } catch {
    return [];
  }
}

// ─── Real-time listener for shared activities ───────────────
export function subscribeToSharedActivities(
  onChange: (activities: ActividadListItem[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const uid = currentUid();

  return onSnapshot(
    query(collection(firebaseClient.firestore, 'users', uid, 'sharedActivities')),
    (snapshot) => {
      const items = snapshot.docs.map((docSnap) =>
        activityDocumentToList(docSnap.id, docSnap.data(), uid),
      );
      onChange(items);
    },
    onError,
  );
}

// ─── Update status for shared activities ────────────────────
export async function updateSharedActivityStatus(
  actividadId: string,
  estado: string,
  propietarioUid: string,
): Promise<void> {
  const uid = currentUid();

  // Update in the own shared copy
  await updateDoc(
    doc(firebaseClient.firestore, 'users', uid, 'sharedActivities', actividadId),
    { estado, updatedAt: serverTimestamp() } as any,
  );

  // Also notify the owner's activity
  try {
    await updateDoc(
      doc(firebaseClient.firestore, 'users', propietarioUid, 'activities', actividadId),
      { estado, updatedAt: serverTimestamp() } as any,
    );
  } catch {
    // Owner might not exist or permission issue - silently fail
  }
}

// ─── Funciones para modo invitado (localStorage) ──────────────────

const GUEST_ACTIVITIES_KEY = 'guest_activities';

function getGuestActivities(): ActividadDetail[] {
  try {
    const data = localStorage.getItem(GUEST_ACTIVITIES_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveGuestActivities(activities: ActividadDetail[]): void {
  try {
    localStorage.setItem(GUEST_ACTIVITIES_KEY, JSON.stringify(activities));
  } catch (error) {
    console.error('Error guardando actividades en localStorage:', error);
  }
}

async function createActivityForGuest(
  payload: Partial<ActividadDetail> & { compartidoCon?: string[] },
): Promise<ActividadDetail> {
  const activities = getGuestActivities();
  const newId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
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
    esCompartida: false,
    puedeEditar: true,
    companerosIds: [],
    recurrence: payload.recurrence,
    updatedAt: new Date().toISOString(),
  };

  activities.push(newActivity);
  saveGuestActivities(activities);
  return newActivity;
}

async function updateActivityForGuest(
  id: string,
  payload: Partial<ActividadDetail & { compartidoCon?: string[] }>,
): Promise<ActividadDetail | null> {
  const activities = getGuestActivities();
  const index = activities.findIndex(act => act.id === id);
  
  if (index === -1) return null;
  
  // Actualizar actividad existente
  const updatedActivity = {
    ...activities[index],
    ...payload,
    updatedAt: new Date().toISOString(),
  };
  
  activities[index] = updatedActivity;
  saveGuestActivities(activities);
  return updatedActivity;
}

function removeActivityForGuest(id: string): void {
  const activities = getGuestActivities();
  const filtered = activities.filter(act => act.id !== id);
  saveGuestActivities(filtered);
}

// Función para listar actividades de invitado
export async function listGuestActivities(): Promise<ActividadListItem[]> {
  const activities = getGuestActivities();
  return activities.map(activity => ({
    id: activity.id,
    titulo: activity.titulo,
    tipo: activity.tipo,
    estado: activity.estado,
    materia: activity.materia,
    fechaInicio: activity.fechaInicio,
    horaInicio: activity.horaInicio,
    duracionMinutos: activity.duracionMinutos,
    prioridad: activity.prioridad,
    color: activity.color,
    esPropietario: true,
    esCompartida: false,
    recurrence: activity.recurrence,
    updatedAt: activity.updatedAt,
  }));
}

// Función para obtener actividad específica de invitado
export async function getGuestActivity(id: string): Promise<ActividadDetail | null> {
  const activities = getGuestActivities();
  return activities.find(act => act.id === id) || null;
}