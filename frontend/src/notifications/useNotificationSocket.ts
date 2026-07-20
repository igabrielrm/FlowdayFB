import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { NotificationItem, NotificationPushPayload } from './types';

const POLL_MS = 60_000;

type Options = {
  enabled: boolean;
  onPush?: (payload: NotificationPushPayload) => void;
};

export function useNotificationSocket({ enabled, onPush }: Options) {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

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
    void refreshAll();
    const interval = window.setInterval(() => {
      refreshAll();
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [enabled, refreshAll]);

  const markRead = useCallback(
    async (id: number) => {
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
    const res = await api.notifications.markAllRead();
    if (res.ok) {
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, leida: true })));
    }
  }, []);

  useEffect(() => {
    if (onPush) {
      console.warn('Realtime notification push is not available in this version.');
    }
  }, [onPush]);

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
