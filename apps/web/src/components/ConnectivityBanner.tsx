import { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

interface ConnectivityBannerProps {
  onRefreshLive?: () => void;
}

export function ConnectivityBanner({ onRefreshLive }: ConnectivityBannerProps) {
  const { status, isOnline, isReconnecting, isStale, lastOnlineAt, checkConnection } =
    useNetworkStatus();

  const [wasOffline, setWasOffline] = useState(false);
  const [showRestoredNotice, setShowRestoredNotice] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Detect transition from offline back to online
  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
      setIsDismissed(false);
    } else if (wasOffline && isOnline) {
      setShowRestoredNotice(true);
      setWasOffline(false);
      const timer = setTimeout(() => {
        setShowRestoredNotice(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  // Don't render if online and no restored notice, or if dismissed while still offline
  if (status === 'online' && !showRestoredNotice) {
    return null;
  }

  if (isDismissed && !showRestoredNotice) {
    return null;
  }

  const formatLastTime = (date: Date | null) => {
    if (!date) return 'earlier';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleRetry = async () => {
    const success = await checkConnection();
    if (success && onRefreshLive) {
      onRefreshLive();
    }
  };

  return (
    <aside
      className={`connectivity-status-banner banner-${status} ${
        showRestoredNotice ? 'banner-restored' : ''
      }`}
      role="status"
      aria-live="polite"
    >
      <div className="connectivity-banner-content">
        {showRestoredNotice ? (
          <>
            <Wifi size={16} className="conn-icon-restored" />
            <span className="conn-message">
              <strong>Back Online</strong> — live telemetry and equipment data synchronized.
            </span>
          </>
        ) : isReconnecting ? (
          <>
            <RefreshCw size={15} className="conn-icon-spin" />
            <span className="conn-message">
              <strong>Reconnecting</strong> to plant network…
            </span>
          </>
        ) : !isOnline ? (
          <>
            <WifiOff size={16} className="conn-icon-offline" />
            <span className="conn-message">
              <strong>Offline Mode</strong> — viewing cached equipment data. Writes and
              status updates require an active connection.
            </span>
            <button
              type="button"
              className="conn-action-btn"
              onClick={handleRetry}
              disabled={isReconnecting}
            >
              <RefreshCw size={12} className={isReconnecting ? 'conn-icon-spin' : ''} />
              <span>Retry</span>
            </button>
          </>
        ) : isStale ? (
          <>
            <AlertTriangle size={15} className="conn-icon-stale" />
            <span className="conn-message">
              <strong>Data May Be Stale</strong> — last updated at {formatLastTime(lastOnlineAt)}.
            </span>
            <button
              type="button"
              className="conn-action-btn"
              onClick={handleRetry}
              disabled={isReconnecting}
            >
              <RefreshCw size={12} className={isReconnecting ? 'conn-icon-spin' : ''} />
              <span>Refresh</span>
            </button>
          </>
        ) : null}
      </div>

      <button
        type="button"
        className="conn-dismiss-btn"
        onClick={() => setIsDismissed(true)}
        aria-label="Dismiss connectivity notification"
      >
        <X size={14} />
      </button>
    </aside>
  );
}
