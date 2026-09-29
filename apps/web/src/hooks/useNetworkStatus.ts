import { useState, useEffect, useCallback, useRef } from 'react';

export type NetworkState = 'online' | 'offline' | 'reconnecting' | 'stale';

interface NetworkStatus {
  status: NetworkState;
  isOnline: boolean;
  isOffline: boolean;
  isReconnecting: boolean;
  isStale: boolean;
  lastOnlineAt: Date | null;
  checkConnection: () => Promise<boolean>;
}

export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  });
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);
  const [lastOnlineAt, setLastOnlineAt] = useState<Date | null>(() => new Date());
  const [isStale, setIsStale] = useState<boolean>(false);
  const pingTimeoutRef = useRef<number | null>(null);

  const checkConnection = useCallback(async (): Promise<boolean> => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setIsOnline(false);
      setIsReconnecting(false);
      return false;
    }

    setIsReconnecting(true);
    try {
      // Lightweight connection probe with cache buster
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`/health?_t=${Date.now()}`, {
        method: 'HEAD',
        signal: controller.signal,
      }).catch(async () => {
        // Fallback to favicon / manifest if api requires auth or fails
        return fetch(`/manifest.json?_t=${Date.now()}`, {
          method: 'HEAD',
          signal: controller.signal,
        });
      });

      clearTimeout(timeoutId);

      const reachable = res.ok || res.status === 401 || res.status === 403;
      setIsOnline(reachable);
      if (reachable) {
        setLastOnlineAt(new Date());
        setIsStale(false);
      } else {
        setIsStale(true);
      }
      setIsReconnecting(false);
      return reachable;
    } catch {
      setIsOnline(false);
      setIsReconnecting(false);
      setIsStale(true);
      return false;
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => {
      // Browser reports online event: verify actual reachability
      checkConnection();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsReconnecting(false);
      setIsStale(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Periodic lightweight reachability check every 45 seconds
    const interval = setInterval(() => {
      if (navigator.onLine) {
        checkConnection();
      }
    }, 45_000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
      if (pingTimeoutRef.current) {
        clearTimeout(pingTimeoutRef.current);
      }
    };
  }, [checkConnection]);

  // Derived overall status
  let status: NetworkState = 'online';
  if (!isOnline) {
    status = 'offline';
  } else if (isReconnecting) {
    status = 'reconnecting';
  } else if (isStale) {
    status = 'stale';
  }

  return {
    status,
    isOnline,
    isOffline: !isOnline,
    isReconnecting,
    isStale,
    lastOnlineAt,
    checkConnection,
  };
}
