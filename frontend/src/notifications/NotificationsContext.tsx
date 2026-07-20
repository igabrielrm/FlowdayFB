import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useNotificationSocket } from './useNotificationSocket';
import type { NotificationItem, NotificationPushPayload } from './types';
import { resolveNotificationTarget } from './types';
import { maybeScheduleIncomingNotification } from './localReminders';

type Toast = {
  id: number;
  titulo: string;
  enlace?: string | null;
  tipo?: string;
};

type NotificationsContextValue = {
  unread: number;
  items: NotificationItem[];
  loading: boolean;
  toasts: Toast[];
  open: boolean;
  setOpen: (open: boolean) => void;
  loadItems: () => Promise<void>;
  markRead: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  dismissToast: (id: number) => void;
  openToast: (toast: Toast) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const openToast = useCallback(
    (toast: Toast) => {
      const target = resolveNotificationTarget(toast.enlace, toast.tipo);
      if (target) {
        navigate({ pathname: target.pathname, search: target.search });
      }
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
    },
    [navigate],
  );

  const onPush = useCallback((payload: NotificationPushPayload) => {
    if (!payload.titulo) return;
    const toastId = payload.id ?? Date.now();
    setToasts((prev) => [
      ...prev.slice(-2),
      { id: toastId, titulo: payload.titulo, enlace: payload.enlace, tipo: payload.tipo },
    ]);
    void maybeScheduleIncomingNotification(payload);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, 4500);
  }, []);

  const socket = useNotificationSocket({ enabled: !!user, onPush });

  const value = useMemo<NotificationsContextValue>(
    () => ({
      unread: socket.unread,
      items: socket.items,
      loading: socket.loading,
      toasts,
      open,
      setOpen,
      loadItems: socket.loadItems,
      markRead: socket.markRead,
      markAllRead: socket.markAllRead,
      dismissToast: (id) => setToasts((prev) => prev.filter((t) => t.id !== id)),
      openToast,
    }),
    [open, openToast, socket, toasts],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications debe usarse dentro de NotificationsProvider');
  return ctx;
}
