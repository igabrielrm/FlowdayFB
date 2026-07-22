import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { firebaseClient } from '../firebase/client';
import { api } from '../api/client';
import type { NotificationItem, NotificationPushPayload } from './types';

type Options = {
  enabled: boolean;
  onPush?: (payload: NotificationPushPayload) => void;
};

function currentUid(): string | null {
  const user = firebaseClient.auth.currentUser;
  if (!user || user.isAnonymous) return null;
  return user.uid;
}

export function useNotificationSocket({ enabled, onPush }: Options) {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const lastSeenId = useRef<string | null>(null);

  const refreshCount = useCallback(async () => {
    const res = await api.notifications.unreadCount();
    if (res.ok && res.data) setUnread(res.data.count);
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    const res = await api.notifications.list();
    if (res.ok && res.data) setItems(res.data);
    setLoading(false);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshCount(), loadItems()]);
  }, [loadItems, refreshCount]);

  useEffect(() => {
    if (!enabled) return;

    const uid = currentUid();
    if (!uid) {
      void refreshAll();
      return;
    }

    setLoading(true);

    const notifRef = collection(firebaseClient.firestore, 'users', uid, 'notifications');
    const q = query(notifRef, orderBy('createdAt', 'desc'), limit(50));

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const notifItems: NotificationItem[] = [];
        let unreadCount = 0;

        snapshot.docs.forEach((docSnap) => {
          const data = docSnap.data();
          const item: NotificationItem = {
            id: docSnap.id as any,
            tipo: data.tipo ?? 'SISTEMA',
            titulo: data.titulo ?? '',
            mensaje: data.mensaje ?? '',
            leida: data.leida ?? false,
            fecha: data.createdAt?.toDate?.()?.toISOString() ?? null,
            enlace: data.enlace ?? null,
          };
          notifItems.push(item);
          if (!item.leida) unreadCount++;

          if (lastSeenId.current && docSnap.id !== lastSeenId.current && onPush && !item.leida) {
            onPush({ ...item, noLeidas: unreadCount });
          }
        });

        if (snapshot.docs.length > 0 && !lastSeenId.current) {
          lastSeenId.current = snapshot.docs[0].id;
        }

        setItems(notifItems);
        setUnread(unreadCount);
        setLoading(false);
      },
      (error) => {
        console.warn('Firestore notifications listener error, falling back to API:', error);
        void refreshAll();
      },
    );

    return () => unsub();
  }, [enabled, onPush, refreshAll]);

  const markRead = useCallback(
    async (id: number) => {
      const uid = currentUid();
      if (uid) {
        try {
          await updateDoc(doc(firebaseClient.firestore, 'users', uid, 'notifications', String(id)), { leida: true });
        } catch { /* fallback to API */ }
      }
      const res = await api.notifications.markRead(id);
      if (res.ok && res.data && typeof res.data.count === 'number') {
        setUnread(res.data.count);
      } else {
        await refreshCount();
      }
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, leida: true } : n)));
    },
    [refreshCount],
  );

  const markAllRead = useCallback(async () => {
    const uid = currentUid();
    if (uid) {
      try {
        const snap = await new Promise<ReturnType<typeof onSnapshot> extends void ? any : any>((resolve) => {
          const q = query(
            collection(firebaseClient.firestore, 'users', uid, 'notifications'),
            where('leida', '==', false),
          );
          onSnapshot(q, (s) => { resolve(s); }, () => { resolve(null); });
        });
        if (snap && snap.size > 0) {
          const batch = writeBatch(firebaseClient.firestore);
          snap.docs.forEach((d: any) => batch.update(d.ref, { leida: true }));
          await batch.commit();
        }
      } catch { /* fallback to API */ }
    }
    const res = await api.notifications.markAllRead();
    if (res.ok) {
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, leida: true })));
    }
  }, []);

  return {
    unread,
    items,
    loading,
    loadItems,
    refreshCount,
    refreshAll,
    markRead,
    markAllRead,
  };
}
