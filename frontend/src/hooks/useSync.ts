import { useCallback, useEffect, useState } from "react";
import { pendingCount, syncQueue, type SyncResult } from "../lib/offlineQueue";
import { useOnlineStatus } from "./useOnlineStatus";

interface SyncState {
  online: boolean;
  pending: number;
  needsAttention: number;
  syncing: boolean;
  lastResult: SyncResult | null;
}

export function useSync() {
  const [state, setState] = useState<SyncState>({
    online: navigator.onLine,
    pending: 0,
    needsAttention: 0,
    syncing: false,
    lastResult: null,
  });

  const refresh = useCallback(async () => {
    const pending = await pendingCount();
    setState((s) => ({ ...s, pending }));
  }, []);

  const syncNow = useCallback(async () => {
    setState((s) => ({ ...s, syncing: true }));
    try {
      const result = await syncQueue();
      setState((s) => ({
        ...s,
        syncing: false,
        pending: result.stillPending,
        lastResult: result,
      }));
      return result;
    } catch {
      setState((s) => ({ ...s, syncing: false }));
      return null;
    }
  }, []);

  const onReconnect = useCallback(() => {
    setState((s) => ({ ...s, online: true }));
    void syncNow();
  }, [syncNow]);

  const online = useOnlineStatus(onReconnect);

  useEffect(() => {
    setState((s) => ({ ...s, online }));
  }, [online]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (navigator.onLine) void syncNow();
    }, 30_000);
    return () => clearInterval(interval);
  }, [refresh, syncNow]);

  return { ...state, syncNow, refresh };
}
