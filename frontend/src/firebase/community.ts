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
  serverTimestamp,
  onSnapshot,
  orderBy,
  type Unsubscribe,
} from 'firebase/firestore';
import { firebaseClient } from './client';
import type { UsuarioDto } from '../api/client';

export type ConnectionStatus = 'pending_sent' | 'pending_received' | 'accepted' | 'rejected' | 'none';

export type FriendRequest = {
  id: string;
  fromUid: string;
  toUid: string;
  status: ConnectionStatus;
  createdAt: number;
  updatedAt?: number;
};

export type FriendUser = {
  uid: string;
  nombre: string;
  correo: string | null;
  foto: string | null;
  status: ConnectionStatus;
  conexionId?: string;
};

function currentUid() {
  const user = firebaseClient.auth.currentUser;
  if (!user) throw new Error('No hay usuario autenticado');
  return user.uid;
}

// ─── Users Collection ───────────────────────────────────────────
export async function ensureUserDocument(uid: string, data?: { nombre?: string; correo?: string; foto?: string }) {
  const ref = doc(firebaseClient.firestore, 'usuarios', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid,
      nombre: data?.nombre ?? 'Invitado',
      correo: data?.correo ?? null,
      foto: data?.foto ?? null,
      ultimoAcceso: serverTimestamp(),
      createdAt: serverTimestamp(),
    });
  } else if (data) {
    await updateDoc(ref, {
      ...data,
      ultimoAcceso: serverTimestamp(),
    });
  }
  return ref;
}

export async function searchUsers(queryText: string): Promise<FriendUser[]> {
  const uid = currentUid();
  const snapshot = await getDocs(collection(firebaseClient.firestore, 'usuarios'));
  const lower = queryText.toLowerCase();

  const users: FriendUser[] = [];
  for (const docSnap of snapshot.docs) {
    if (docSnap.id === uid) continue;
    const data = docSnap.data();
    const nombre: string = data.nombre ?? '';
    const correo: string | null = data.correo ?? null;
    if (
      queryText &&
      !nombre.toLowerCase().includes(lower) &&
      !(correo && correo.toLowerCase().includes(lower))
    ) {
      continue;
    }
    users.push({
      uid: docSnap.id,
      nombre,
      correo,
      foto: data.foto ?? null,
      status: 'none',
    });
  }

  // Get connection statuses for all found users
  const connectionStatuses = await Promise.all(
    users.map((u) => getConnectionStatus(u.uid)),
  );
  users.forEach((u, i) => {
    const cs = connectionStatuses[i];
    if (cs) {
      u.status = cs.status;
      u.conexionId = cs.conexionId;
    }
  });

  return users;
}

// ─── Friend Requests Collection ──────────────────────────────────
async function getConnectionStatus(targetUid: string): Promise<{ status: ConnectionStatus; conexionId?: string } | null> {
  const uid = currentUid();
  if (!uid) return null;

  // Check for sent requests
  const sentQuery = query(
    collection(firebaseClient.firestore, 'solicitudes_amistad'),
    where('fromUid', '==', uid),
    where('toUid', '==', targetUid),
  );
  const sentSnap = await getDocs(sentQuery);
  if (!sentSnap.empty) {
    const data = sentSnap.docs[0].data() as FriendRequest;
    if (data.status === 'accepted') return { status: 'accepted', conexionId: sentSnap.docs[0].id };
    return { status: 'pending_sent', conexionId: sentSnap.docs[0].id };
  }

  // Check for received requests
  const receivedQuery = query(
    collection(firebaseClient.firestore, 'solicitudes_amistad'),
    where('fromUid', '==', targetUid),
    where('toUid', '==', uid),
  );
  const receivedSnap = await getDocs(receivedQuery);
  if (!receivedSnap.empty) {
    const data = receivedSnap.docs[0].data() as FriendRequest;
    if (data.status === 'accepted') return { status: 'accepted', conexionId: receivedSnap.docs[0].id };
    return { status: 'pending_received', conexionId: receivedSnap.docs[0].id };
  }

  return null;
}

export async function sendFriendRequest(toUid: string): Promise<string | null> {
  const uid = currentUid();
  if (uid === toUid) return 'No puedes enviarte una solicitud a ti mismo';

  try {
    const ref = doc(collection(firebaseClient.firestore, 'solicitudes_amistad'));
    await setDoc(ref, {
      fromUid: uid,
      toUid,
      status: 'pending_sent',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return null;
  } catch (error) {
    return String((error as Error).message || 'Error al enviar solicitud');
  }
}

export async function acceptFriendRequest(requestId: string): Promise<string | null> {
  try {
    const ref = doc(firebaseClient.firestore, 'solicitudes_amistad', requestId);
    await updateDoc(ref, {
      status: 'accepted',
      updatedAt: Date.now(),
    });
    return null;
  } catch (error) {
    return String((error as Error).message || 'Error al aceptar solicitud');
  }
}

export async function rejectFriendRequest(requestId: string): Promise<string | null> {
  try {
    await deleteDoc(doc(firebaseClient.firestore, 'solicitudes_amistad', requestId));
    return null;
  } catch (error) {
    return String((error as Error).message || 'Error al rechazar solicitud');
  }
}

export async function cancelFriendRequest(requestId: string): Promise<string | null> {
  try {
    await deleteDoc(doc(firebaseClient.firestore, 'solicitudes_amistad', requestId));
    return null;
  } catch (error) {
    return String((error as Error).message || 'Error al cancelar solicitud');
  }
}

export async function removeFriend(connectionId: string): Promise<string | null> {
  try {
    await deleteDoc(doc(firebaseClient.firestore, 'solicitudes_amistad', connectionId));
    return null;
  } catch (error) {
    return String((error as Error).message || 'Error al eliminar conexión');
  }
}

export async function getFriends(): Promise<FriendUser[]> {
  const uid = currentUid();
  const results: FriendUser[] = [];

  // Get accepted connections
  const sentQuery = query(
    collection(firebaseClient.firestore, 'solicitudes_amistad'),
    where('fromUid', '==', uid),
    where('status', '==', 'accepted'),
  );
  const sentSnap = await getDocs(sentQuery);
  for (const docSnap of sentSnap.docs) {
    const data = docSnap.data() as FriendRequest;
    const userSnap = await getDoc(doc(firebaseClient.firestore, 'usuarios', data.toUid));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      results.push({
        uid: data.toUid,
        nombre: userData.nombre ?? 'Desconocido',
        correo: userData.correo ?? null,
        foto: userData.foto ?? null,
        status: 'accepted',
        conexionId: docSnap.id,
      });
    }
  }

  const receivedQuery = query(
    collection(firebaseClient.firestore, 'solicitudes_amistad'),
    where('toUid', '==', uid),
    where('status', '==', 'accepted'),
  );
  const receivedSnap = await getDocs(receivedQuery);
  for (const docSnap of receivedSnap.docs) {
    const data = docSnap.data() as FriendRequest;
    const userSnap = await getDoc(doc(firebaseClient.firestore, 'usuarios', data.fromUid));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      results.push({
        uid: data.fromUid,
        nombre: userData.nombre ?? 'Desconocido',
        correo: userData.correo ?? null,
        foto: userData.foto ?? null,
        status: 'accepted',
        conexionId: docSnap.id,
      });
    }
  }

  return results;
}

export async function getPendingRequests(): Promise<FriendUser[]> {
  const uid = currentUid();
  const results: FriendUser[] = [];

  const query_ = query(
    collection(firebaseClient.firestore, 'solicitudes_amistad'),
    where('toUid', '==', uid),
    where('status', '==', 'pending_sent'),
  );
  const snap = await getDocs(query_);

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as FriendRequest;
    const userSnap = await getDoc(doc(firebaseClient.firestore, 'usuarios', data.fromUid));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      results.push({
        uid: data.fromUid,
        nombre: userData.nombre ?? 'Desconocido',
        correo: userData.correo ?? null,
        foto: userData.foto ?? null,
        status: 'pending_received',
        conexionId: docSnap.id,
      });
    }
  }

  return results;
}

// ─── Real-time listeners ────────────────────────────────────────
export function subscribeToFriendRequests(
  onChange: (requests: FriendUser[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const uid = currentUid();

  const q = query(
    collection(firebaseClient.firestore, 'solicitudes_amistad'),
    where('toUid', '==', uid),
    where('status', '==', 'pending_sent'),
  );

  return onSnapshot(
    q,
    async (snapshot) => {
      const results: FriendUser[] = [];
      for (const change of snapshot.docs) {
        const data = change.data() as FriendRequest;
        const userSnap = await getDoc(doc(firebaseClient.firestore, 'usuarios', data.fromUid));
        if (userSnap.exists()) {
          const userData = userSnap.data();
          results.push({
            uid: data.fromUid,
            nombre: userData.nombre ?? 'Desconocido',
            correo: userData.correo ?? null,
            foto: userData.foto ?? null,
            status: 'pending_received',
            conexionId: change.id,
          });
        }
      }
      onChange(results);
    },
    onError,
  );
}

export function subscribeToFriends(
  onChange: (friends: FriendUser[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe[] {
  const uid = currentUid();
  const unsubs: Unsubscribe[] = [];

  // Listen for sent & accepted
  const sentQuery = query(
    collection(firebaseClient.firestore, 'solicitudes_amistad'),
    where('fromUid', '==', uid),
    where('status', '==', 'accepted'),
  );

  unsubs.push(
    onSnapshot(
      sentQuery,
      async (snapshot) => {
        const newFriends = await buildFriendsFromSnapshot(snapshot.docs, 'toUid');
        // Get also received
        const receivedSnap = await getDocs(
          query(
            collection(firebaseClient.firestore, 'solicitudes_amistad'),
            where('toUid', '==', uid),
            where('status', '==', 'accepted'),
          ),
        );
        const receivedFriends = await buildFriendsFromSnapshot(receivedSnap.docs, 'fromUid');
        onChange([...newFriends, ...receivedFriends]);
      },
      onError,
    ),
  );

  return unsubs;
}

async function buildFriendsFromSnapshot(
  docs: { id: string; data(): Record<string, unknown> }[],
  userField: 'fromUid' | 'toUid',
): Promise<FriendUser[]> {
  const results: FriendUser[] = [];
  for (const docSnap of docs) {
    const data = docSnap.data() as unknown as FriendRequest;
    const targetUid = data[userField === 'fromUid' ? 'toUid' : 'fromUid'] as string;
    const userSnap = await getDoc(doc(firebaseClient.firestore, 'usuarios', targetUid));
    if (userSnap.exists()) {
      const userData = userSnap.data();
      results.push({
        uid: targetUid,
        nombre: userData.nombre ?? 'Desconocido',
        correo: userData.correo ?? null,
        foto: userData.foto ?? null,
        status: 'accepted',
        conexionId: docSnap.id,
      });
    }
  }
  return results;
}