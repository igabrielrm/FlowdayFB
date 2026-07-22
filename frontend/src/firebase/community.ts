import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, orderBy, serverTimestamp, onSnapshot } from 'firebase/firestore';
import { firebaseClient, normalizeSnapshot } from './client';
import type { CommunityStats, CommunityUser } from '../types/community';
import type { UsuarioDto } from '../api/client';

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

interface UserDoc {
  uid: string;
  displayName?: string;
  email?: string | null;
  photoURL?: string | null;
  lastActive?: any;
  createdAt?: any;
  updatedAt?: any;
}

// Guardar o actualizar usuario en la colección users de Firestore
export async function saveUserProfile(uid: string, data: { nombre: string; correo?: string | null; foto?: string | null }): Promise<void> {
  const ref = doc(firebaseClient.firestore, 'users', uid);
  await setDoc(ref, {
    uid,
    displayName: data.nombre,
    email: data.correo ?? null,
    photoURL: data.foto ?? null,
    lastActive: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

// Obtener usuario por UID y retornar como UsuarioDto
export async function getUserDto(uid: string): Promise<UsuarioDto | null> {
  try {
    const snapshot = await getDoc(doc(firebaseClient.firestore, 'users', uid));
    if (!snapshot.exists()) return null;
    const data = snapshot.data() as UserDoc;
    return {
      id: data.uid,
      nombre: data.displayName ?? 'Usuario',
      correo: data.email ?? null,
      rol: 'USER',
      foto: data.photoURL ?? undefined,
    };
  } catch {
    return null;
  }
}

// Listar todos los usuarios como UsuarioDto[]
export async function listUsersAsDto(): Promise<UsuarioDto[]> {
  try {
    const snapshot = await getDocs(
      query(collection(firebaseClient.firestore, 'users'), orderBy('lastActive', 'desc')),
    );
    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data() as UserDoc;
      return {
        id: data.uid,
        nombre: data.displayName ?? 'Usuario',
        correo: data.email ?? null,
        rol: 'USER',
        foto: data.photoURL ?? undefined,
      };
    });
  } catch (error) {
    console.error('Error al listar usuarios:', error);
    return [];
  }
}

// Listar usuarios excluyendo el actual
export async function listOtherUsers(): Promise<UsuarioDto[]> {
  const uid = currentUid();
  try {
    const users = await listUsersAsDto();
    return uid ? users.filter(u => String(u.id) !== uid) : users;
  } catch {
    return [];
  }
}

export type FriendUser = UsuarioDto;

// Obtener amigos (conexiones aceptadas)
export async function getFriends(): Promise<FriendUser[]> {
  const uid = requireAuthUid();
  try {
    const snapshot = await getDocs(
      query(collection(firebaseClient.firestore, 'users', uid, 'connections'), where('status', '==', 'accepted')),
    );
    const friendIds = snapshot.docs.map((docSnap) => docSnap.id);
    if (friendIds.length === 0) return [];
    const friends: FriendUser[] = [];
    for (const friendId of friendIds) {
      const friend = await getUserDto(friendId);
      if (friend) friends.push(friend);
    }
    return friends;
  } catch {
    return [];
  }
}

// ─── Stats ──────────────────────────────────────────────────────

export async function getCommunityStats(): Promise<CommunityStats> {
  try {
    const users = await listUsersAsDto();
    return { totalUsuarios: users.length, totalConexiones: 0, tasaConexion: 0 };
  } catch {
    return { totalUsuarios: 0, totalConexiones: 0, tasaConexion: 0 };
  }
}

export interface ConnectionRequest {
  id: string;
  from: string;
  to: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt?: string;
}

// Enviar solicitud de conexión
export async function sendConnectionRequest(targetUid: string): Promise<boolean> {
  const uid = requireAuthUid();
  try {
    const ref = doc(firebaseClient.firestore, 'users', targetUid, 'connectionRequests', uid);
    await setDoc(ref, {
      from: uid,
      to: targetUid,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error al enviar solicitud:', error);
    return false;
  }
}

// Aceptar solicitud de conexión
export async function acceptConnectionRequest(fromUid: string): Promise<boolean> {
  const uid = requireAuthUid();
  try {
    // Actualizar la solicitud
    await updateDoc(doc(firebaseClient.firestore, 'users', uid, 'connectionRequests', fromUid), {
      status: 'accepted',
      updatedAt: serverTimestamp(),
    } as any);
    // Crear conexión bidireccional
    await setDoc(doc(firebaseClient.firestore, 'users', uid, 'connections', fromUid), {
      status: 'accepted',
      createdAt: serverTimestamp(),
    });
    await setDoc(doc(firebaseClient.firestore, 'users', fromUid, 'connections', uid), {
      status: 'accepted',
      createdAt: serverTimestamp(),
    });
    return true;
  } catch (error) {
    console.error('Error al aceptar solicitud:', error);
    return false;
  }
}

// Rechazar solicitud de conexión
export async function rejectConnectionRequest(fromUid: string): Promise<boolean> {
  const uid = requireAuthUid();
  try {
    await deleteDoc(doc(firebaseClient.firestore, 'users', uid, 'connectionRequests', fromUid));
    return true;
  } catch (error) {
    console.error('Error al rechazar solicitud:', error);
    return false;
  }
}

// Eliminar conexión
export async function removeConnection(friendUid: string): Promise<boolean> {
  const uid = requireAuthUid();
  try {
    await deleteDoc(doc(firebaseClient.firestore, 'users', uid, 'connections', friendUid));
    await deleteDoc(doc(firebaseClient.firestore, 'users', friendUid, 'connections', uid));
    return true;
  } catch {
    return false;
  }
}

// Obtener solicitudes pendientes
export async function getPendingRequests(): Promise<ConnectionRequest[]> {
  const uid = requireAuthUid();
  try {
    const snapshot = await getDocs(
      query(
        collection(firebaseClient.firestore, 'users', uid, 'connectionRequests'),
        where('status', '==', 'pending'),
      ),
    );
    return snapshot.docs.map((docSnap) => normalizeSnapshot<ConnectionRequest>(docSnap.data(), docSnap.id));
  } catch {
    return [];
  }
}

// ─── Compatibility aliases for CommunityPage ─────────────────────
export const searchUsers = async (searchTerm: string, currentUserId?: string) => {
  if (!searchTerm || !searchTerm.trim()) return [];
  try {
    const users = await listUsersAsDto();
    const term = searchTerm.toLowerCase();
    return users
      .filter((u) => currentUserId ? String(u.id) !== currentUserId : true)
      .filter((u) =>
        (u.nombre && u.nombre.toLowerCase().includes(term)) ||
        (u.correo && u.correo.toLowerCase().includes(term))
      )
      .map((u) => ({ ...u, status: 'none', compatibilidad: 0, conectado: false, estadoRelacion: 'NINGUNA' as const }));
  } catch {
    return [];
  }
};

export const sendFriendRequest = async (userId: string): Promise<string | null> => {
  const ok = await sendConnectionRequest(userId);
  return ok ? null : 'No se pudo enviar la solicitud';
};

export const acceptFriendRequest = async (conexionId: string): Promise<string | null> => {
  const ok = await acceptConnectionRequest(conexionId);
  return ok ? null : 'No se pudo aceptar la solicitud';
};

export const rejectFriendRequest = async (conexionId: string): Promise<string | null> => {
  const ok = await rejectConnectionRequest(conexionId);
  return ok ? null : 'No se pudo rechazar la solicitud';
};

export const cancelFriendRequest = async (targetUid: string): Promise<string | null> => {
  const uid = currentUid();
  if (!uid) return 'No hay usuario autenticado';
  try {
    await deleteDoc(doc(firebaseClient.firestore, 'users', targetUid, 'connectionRequests', uid));
    return null;
  } catch {
    return 'No se pudo cancelar la solicitud';
  }
};

export const removeFriend = async (friendUid: string): Promise<string | null> => {
  const ok = await removeConnection(friendUid);
  return ok ? null : 'No se pudo eliminar la conexión';
};

// Real-time subscriptions for CommunityPage
export const subscribeToFriendRequests = (callback: (requests: FriendUser[]) => void, onError?: (err: any) => void): (() => void) => {
  const uid = currentUid();
  if (!uid) { callback([]); return () => {}; }

  return onSnapshot(
    query(
      collection(firebaseClient.firestore, 'users', uid, 'connectionRequests'),
      where('status', '==', 'pending'),
    ),
    async (snapshot) => {
      const requests: FriendUser[] = [];
      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const fromUid = data.from as string;
        const user = await getUserDto(fromUid);
        if (user) {
          requests.push({ ...user, status: 'pending_received', conexionId: fromUid });
        }
      }
      callback(requests);
    },
    onError,
  );
};

export const subscribeToFriends = (callback: (friends: FriendUser[]) => void, onError?: (err: any) => void): (() => void)[] => {
  const uid = currentUid();
  if (!uid) { callback([]); return [() => {}]; }

  const unsubAccepted = onSnapshot(
    query(
      collection(firebaseClient.firestore, 'users', uid, 'connections'),
      where('status', '==', 'accepted'),
    ),
    async (snapshot) => {
      const friends: FriendUser[] = [];
      for (const docSnap of snapshot.docs) {
        const friendUid = docSnap.id;
        const user = await getUserDto(friendUid);
        if (user) {
          friends.push({ ...user, status: 'accepted', conexionId: friendUid });
        }
      }
      callback(friends);
    },
    onError,
  );

  return [unsubAccepted];
};

