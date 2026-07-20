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
import type { ActividadDetail, ActividadListItem } from '../types/activity';

function currentUid() {
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
  const snapshot = await getDocs(
    query(
      collection(firebaseClient.firestore, 'users', uid, 'activities'),
      orderBy('fechaInicio', 'asc'),
    ),
  );
  return snapshot.docs.map((docSnap) =>
    activityDocumentToList(docSnap.id, docSnap.data(), uid),
  );
}

export async function getOwnActivity(uid: string, id: string): Promise<ActividadDetail | null> {
  const snapshot = await getDoc(doc(firebaseClient.firestore, 'users', uid, 'activities', id));
  if (!snapshot.exists()) return null;
  return activityDocumentToDetail(snapshot.id, snapshot.data(), uid);
}

// ─── Create activity with compartidoCon ─────────────────────
export async function createActivity(
  payload: Partial<ActividadDetail> & { compartidoCon?: string[] },
): Promise<ActividadDetail> {
  const uid = currentUid();
  const activitiesRef = collection(firebaseClient.firestore, 'users', uid, 'activities');
  const newDoc = doc(activitiesRef);

  const compartidoCon = Array.isArray(payload.compartidoCon) ? payload.compartidoCon : [];

  const data = {
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
  };

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
  const ref = doc(firebaseClient.firestore, 'users', uid, 'activities', id);

  const updateData = { ...payload, updatedAt: serverTimestamp() };
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