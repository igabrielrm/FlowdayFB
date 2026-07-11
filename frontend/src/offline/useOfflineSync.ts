import { useCallback, useEffect, useState } from 'react';
import { OFFLINE_QUEUE_EVENT } from '../events';
import { pendingCount } from './queue';
import { flushOfflineQueue } from './sync';
import { useOnlineStatus } from './useOnlineStatus';

export function useOfflineSync() {
  const online = useOnlineStatus();
  const [pending, setPending] = useState(pendingCount);
  const [syncing, setSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refreshPending = useCallback(() => {
    setPending(pendingCount());
  }, []);

  const syncNow = useCallback(async () => {
    if (!navigator.onLine || pendingCount() === 0) return;
    setSyncing(true);
    setLastError(null);
    const result = await flushOfflineQueue();
    refreshPending();
    setSyncing(false);
    if (result.errors.length > 0) {
      setLastError(result.errors[0]);
    }
  }, [refreshPending]);

  useEffect(() => {
    refreshPending();
    const onQueue = () => refreshPending();
    window.addEventListener(OFFLINE_QUEUE_EVENT, onQueue);
    return () => window.removeEventListener(OFFLINE_QUEUE_EVENT, onQueue);
  }, [refreshPending]);

  useEffect(() => {
    if (online && pendingCount() > 0) {
      syncNow();
    }
  }, [online, syncNow]);

  return { online, pending, syncing, lastError, syncNow, refreshPending };
}
