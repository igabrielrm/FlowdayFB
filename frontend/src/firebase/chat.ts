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
  limit,
  serverTimestamp,
  onSnapshot,
  type Unsubscribe,
  type Timestamp,
} from 'firebase/firestore';
import { firebaseClient } from './client';
import type { FriendUser } from './community';

export type ChatMessage = {
  id: string;
  chatId: string;
  remitenteId: string;
  destinatarioId: string;
  contenido: string;
  fecha: string;
  leida: boolean;
  propio: boolean;
};

export type ConversationData = {
  user: FriendUser;
  ultimoMensaje?: string | null;
  ultimaFecha?: string | null;
  noLeidos: number;
  chatId: string;
};

function currentUid() {
  const user = firebaseClient.auth.currentUser;
  if (!user) throw new Error('No hay usuario autenticado');
  return user.uid;
}

// Generate a deterministic chat ID for two users (sorted UIDs)
function chatIdFromUsers(uid1: string, uid2: string): string {
  return [uid1, uid2].sort().join('_');
}

// ─── Send a message ──────────────────────────────────────────
export async function sendMessage(
  destinatarioId: string,
  texto: string,
): Promise<ChatMessage | null> {
  const uid = currentUid();
  const chatId = chatIdFromUsers(uid, destinatarioId);

  try {
    const msgRef = doc(collection(firebaseClient.firestore, 'mensajes'));
    const msgData = {
      chatId,
      remitenteId: uid,
      destinatarioId,
      contenido: texto,
      leida: false,
      createdAt: serverTimestamp(),
    };
    await setDoc(msgRef, msgData);

    // Also update the conversation metadata
    const convRef = doc(firebaseClient.firestore, 'conversaciones', chatId);
    const convSnap = await getDoc(convRef);
    if (convSnap.exists()) {
      await updateDoc(convRef, {
        ultimoMensaje: texto,
        ultimaFecha: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(convRef, {
        participantes: [uid, destinatarioId],
        ultimoMensaje: texto,
        ultimaFecha: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    return {
      id: msgRef.id,
      chatId,
      remitenteId: uid,
      destinatarioId,
      contenido: texto,
      fecha: new Date().toISOString(),
      leida: false,
      propio: true,
    };
  } catch (error) {
    console.error('Error sending message:', error);
    return null;
  }
}

// ─── Get conversations ──────────────────────────────────────
export async function getConversations(friends: FriendUser[]): Promise<ConversationData[]> {
  const uid = currentUid();
  const results: ConversationData[] = [];

  // Get all conversations for this user
  const convQuery = query(
    collection(firebaseClient.firestore, 'conversaciones'),
    where('participantes', 'array-contains', uid),
    orderBy('ultimaFecha', 'desc'),
  );

  try {
    const snap = await getDocs(convQuery);
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      const otherUid = (data.participantes as string[]).find((p: string) => p !== uid);
      if (!otherUid) continue;

      // Find friend info
      const friend = friends.find((f) => f.uid === otherUid);
      if (!friend) continue;

      // Count unread messages
      const unreadQuery = query(
        collection(firebaseClient.firestore, 'mensajes'),
        where('chatId', '==', docSnap.id),
        where('destinatarioId', '==', uid),
        where('leida', '==', false),
      );
      const unreadSnap = await getDocs(unreadQuery);

      results.push({
        user: friend,
        ultimoMensaje: data.ultimoMensaje ?? null,
        ultimaFecha: data.ultimaFecha ? String(data.ultimaFecha) : null,
        noLeidos: unreadSnap.size,
        chatId: docSnap.id,
      });
    }
  } catch (error) {
    console.error('Error getting conversations:', error);
  }

  return results;
}

// ─── Get messages for a conversation ────────────────────────
export async function getMessages(otherUid: string, maxMessages = 50): Promise<ChatMessage[]> {
  const uid = currentUid();
  const chatId = chatIdFromUsers(uid, otherUid);

  try {
    const msgQuery = query(
      collection(firebaseClient.firestore, 'mensajes'),
      where('chatId', '==', chatId),
      orderBy('createdAt', 'asc'),
      limit(maxMessages),
    );
    const snap = await getDocs(msgQuery);
    return snap.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        chatId,
        remitenteId: data.remitenteId ?? '',
        destinatarioId: data.destinatarioId ?? '',
        contenido: data.contenido ?? '',
        fecha: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
        leida: data.leida ?? false,
        propio: data.remitenteId === uid,
      } as ChatMessage;
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    return [];
  }
}

// ─── Real-time listener for messages ────────────────────────
export function subscribeToMessages(
  otherUid: string,
  onChange: (messages: ChatMessage[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const uid = currentUid();
  const chatId = chatIdFromUsers(uid, otherUid);

  const msgQuery = query(
    collection(firebaseClient.firestore, 'mensajes'),
    where('chatId', '==', chatId),
    orderBy('createdAt', 'asc'),
    limit(100),
  );

  return onSnapshot(
    msgQuery,
    (snapshot) => {
      const messages = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          chatId,
          remitenteId: data.remitenteId ?? '',
          destinatarioId: data.destinatarioId ?? '',
          contenido: data.contenido ?? '',
          fecha: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
          leida: data.leida ?? false,
          propio: data.remitenteId === uid,
        } as ChatMessage;
      });
      onChange(messages);
    },
    onError,
  );
}

// ─── Mark messages as read ──────────────────────────────────
export async function markMessagesAsRead(otherUid: string): Promise<void> {
  const uid = currentUid();
  const chatId = chatIdFromUsers(uid, otherUid);

  try {
    const unreadQuery = query(
      collection(firebaseClient.firestore, 'mensajes'),
      where('chatId', '==', chatId),
      where('destinatarioId', '==', uid),
      where('leida', '==', false),
    );
    const snap = await getDocs(unreadQuery);
    const updates = snap.docs.map((d) => updateDoc(doc(firebaseClient.firestore, 'mensajes', d.id), { leida: true }));
    await Promise.all(updates);
  } catch (error) {
    console.error('Error marking messages as read:', error);
  }
}

// ─── Delete conversation ────────────────────────────────────
export async function deleteConversation(otherUid: string): Promise<boolean> {
  const uid = currentUid();
  const chatId = chatIdFromUsers(uid, otherUid);

  try {
    // Delete all messages
    const msgQuery = query(
      collection(firebaseClient.firestore, 'mensajes'),
      where('chatId', '==', chatId),
    );
    const snap = await getDocs(msgQuery);
    await Promise.all(snap.docs.map((d) => deleteDoc(doc(firebaseClient.firestore, 'mensajes', d.id))));

    // Delete conversation metadata
    await deleteDoc(doc(firebaseClient.firestore, 'conversaciones', chatId));
    return true;
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return false;
  }
}

// ─── Real-time listener for unread count ────────────────────
export function subscribeToUnreadCount(
  onChange: (count: number) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const uid = currentUid();

  const unreadQuery = query(
    collection(firebaseClient.firestore, 'mensajes'),
    where('destinatarioId', '==', uid),
    where('leida', '==', false),
  );

  return onSnapshot(
    unreadQuery,
    (snapshot) => {
      onChange(snapshot.size);
    },
    onError,
  );
}