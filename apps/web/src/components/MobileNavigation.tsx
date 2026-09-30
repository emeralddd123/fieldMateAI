import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  AudioLines,
  Building2,
  Cpu,
  LogOut,
  Mic,
  MicOff,
  MoreHorizontal,
  QrCode,
  Settings,
  ShieldCheck,
  Wrench,
  X,
} from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import type { VoiceControlsState } from './VoiceControls';

export interface MobileBottomNavProps {
  activeTab?: 'equipment' | 'voice' | 'incidents' | 'more';
  activeAssetTag?: string;
  incidentCount?: number;
  voice?: VoiceControlsState;
  onOpenEquipment?: () => void;
  onOpenVoice?: () => void;
  onOpenWorkMode?: () => void;
  onOpenIncidents?: () => void;
  onOpenQrScanner?: () => void;
}

export function MobileBottomNav({
  activeTab = 'equipment',
  activeAssetTag,
  incidentCount = 0,
  voice,
  onOpenEquipment,
  onOpenVoice,
  onOpenWorkMode,
  onOpenIncidents,
  onOpenQrScanner,
}: MobileBottomNavProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const isVoiceActive =
    voice && !['disconnected', 'error'].includes(voice.status);

  const handleVoiceClick = () => {
    if (onOpenVoice) {
      onOpenVoice();
    } else if (voice) {
      if (isVoiceActive) {
        voice.end();
      } else {
        voice.connect();
      }
    }
  };

  return (
    <>
      <nav
        className="mobile-bottom-nav"
        aria-label="Mobile navigation"
        role="navigation"
      >
        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'equipment' ? 'active' : ''}`}
          onClick={onOpenEquipment}
          aria-label={`Equipment view${activeAssetTag ? `, selected ${activeAssetTag}` : ''}`}
        >
          <div className="mobile-nav-icon-wrap">
            <Wrench size={20} />
          </div>
          <span className="mobile-nav-label">
            {activeAssetTag ? activeAssetTag : 'Equipment'}
          </span>
        </button>

        <button
          type="button"
          className={`mobile-nav-voice-btn ${isVoiceActive ? 'voice-active' : ''}`}
          onClick={handleVoiceClick}
          aria-label={
            isVoiceActive
              ? voice?.muted
                ? 'Voice muted, tap to unmute'
                : 'FieldMate voice active, tap to end'
              : 'Start FieldMate voice assistant'
          }
        >
          <div className="voice-pulse-ring" />
          <div className="voice-btn-inner">
            {isVoiceActive ? (
              voice?.muted ? (
                <MicOff size={24} />
              ) : (
                <div className="mobile-voice-waves">
                  <span />
                  <span />
                  <span />
                </div>
              )
            ) : (
              <Mic size={24} />
            )}
          </div>
          <span className="mobile-voice-label">
            {isVoiceActive
              ? voice?.status === 'speaking'
                ? 'Speaking'
                : 'Live'
              : 'Voice'}
          </span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${activeTab === 'incidents' ? 'active' : ''}`}
          onClick={onOpenIncidents}
          aria-label={`Incidents register, ${incidentCount} active`}
        >
          <div className="mobile-nav-icon-wrap">
            <AlertTriangle size={20} />
            {incidentCount > 0 && (
              <span className="mobile-nav-badge">{incidentCount}</span>
            )}
          </div>
          <span className="mobile-nav-label">Incidents</span>
        </button>

        <button
          type="button"
          className={`mobile-nav-item ${isMoreOpen ? 'active' : ''}`}
          onClick={() => setIsMoreOpen(true)}
          aria-label="Open more options"
        >
          <div className="mobile-nav-icon-wrap">
            <MoreHorizontal size={20} />
          </div>
          <span className="mobile-nav-label">More</span>
        </button>
      </nav>

      {isMoreOpen && (
        <MobileMoreSheet
          onClose={() => setIsMoreOpen(false)}
          onOpenQrScanner={() => {
            setIsMoreOpen(false);
            onOpenQrScanner?.();
          }}
          onOpenWorkMode={() => {
            setIsMoreOpen(false);
            onOpenWorkMode?.();
          }}
        />
      )}
    </>
  );
}

export function MobileHeader({
  plantName,
  onOpenQrScanner,
  onOpenIncidents,
  incidentCount = 0,
}: {
  plantName?: string;
  onOpenQrScanner?: () => void;
  onOpenIncidents?: () => void;
  incidentCount?: number;
}) {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header className="mobile-header">
      <Link to="/" className="mobile-header-brand" aria-label="FieldMate AI">
        <span className="brand-mark">
          <AudioLines size={20} />
        </span>
        <span className="brand-text">
          FieldMate<span className="brand-ai">AI</span>
        </span>
      </Link>

      <div className="mobile-header-center">
        <span className="mobile-plant-pill" title={plantName ?? 'Plant Alpha'}>
          <span
            className={`connectivity-dot ${isOnline ? 'online' : 'offline'}`}
            title={isOnline ? 'Online' : 'Offline'}
          />
          <span className="plant-name">{plantName ?? 'Plant Alpha'}</span>
        </span>
      </div>

      <div className="mobile-header-actions">
        {onOpenQrScanner && (
          <button
            type="button"
            className="mobile-header-btn"
            onClick={onOpenQrScanner}
            title="Scan equipment QR tag"
            aria-label="Scan equipment QR tag"
          >
            <QrCode size={18} />
          </button>
        )}
        {onOpenIncidents && (
          <button
            type="button"
            className="mobile-header-btn"
            onClick={onOpenIncidents}
            title="Open Incidents"
            aria-label={`Open Incidents (${incidentCount})`}
          >
            <AlertTriangle size={18} />
            {incidentCount > 0 && (
              <span className="mobile-header-badge">{incidentCount}</span>
            )}
          </button>
        )}
      </div>
    </header>
  );
}

export function MobileMoreSheet({
  onClose,
  onOpenQrScanner,
  onOpenWorkMode,
}: {
  onClose: () => void;
  onOpenQrScanner?: () => void;
  onOpenWorkMode?: () => void;
}) {
  const auth = useAuth();
  const navigate = useNavigate();
  const session = auth.session;
  const user = session?.user;
  const membership = session?.memberships[0];

  useEffect(() => {
    const body = document.body;
    const scrollPosition = window.scrollY;
    const previousStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
    };

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollPosition}px`;
    body.style.width = '100%';

    return () => {
      body.style.overflow = previousStyles.overflow;
      body.style.position = previousStyles.position;
      body.style.top = previousStyles.top;
      body.style.width = previousStyles.width;
      window.scrollTo(0, scrollPosition);
    };
  }, []);

  const initials = user?.name
    ? user.name
        .split(/\s+/)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase()
    : 'FM';

  return (
    <div
      className="mobile-sheet-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="More navigation and account menu"
    >
      <div className="mobile-more-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="mobile-sheet-handle" />

        <div className="mobile-sheet-header">
          <div className="sheet-user-identity">
            <span className="sheet-avatar">{initials}</span>
            <div className="sheet-user-meta">
              <strong>{user?.name ?? 'Field Technician'}</strong>
              <small>{user?.email}</small>
              <div className="sheet-role-pills">
                <span className="role-chip">
                  {membership?.role ?? 'technician'}
                </span>
                <span className="org-chip">
                  <Building2 size={11} />
                  {membership?.organization.name ?? 'FieldMate Ops'}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="sheet-close-btn"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mobile-sheet-body">
          <div className="sheet-group-label">QUICK TOOLS</div>
          <div className="sheet-nav-list">
            {onOpenWorkMode && (
              <button
                type="button"
                className="sheet-nav-item"
                onClick={onOpenWorkMode}
              >
                <div className="sheet-nav-icon work-mode-icon">
                  <AudioLines size={18} />
                </div>
                <div className="sheet-nav-text">
                  <span>Hands-Free Work Mode</span>
                  <small>Step-by-step minimal-touch guidance</small>
                </div>
              </button>
            )}

            {onOpenQrScanner && (
              <button
                type="button"
                className="sheet-nav-item"
                onClick={onOpenQrScanner}
              >
                <div className="sheet-nav-icon scanner-icon">
                  <QrCode size={18} />
                </div>
                <div className="sheet-nav-text">
                  <span>Scan Equipment QR</span>
                  <small>Camera scanner for machine barcodes</small>
                </div>
              </button>
            )}

            <Link to="/account" className="sheet-nav-item" onClick={onClose}>
              <div className="sheet-nav-icon account-icon">
                <Settings size={18} />
              </div>
              <div className="sheet-nav-text">
                <span>Account & Security</span>
                <small>Profile, password & active sessions</small>
              </div>
            </Link>
          </div>

          <div className="sheet-group-label">WORKSPACES</div>
          <div className="sheet-nav-list">
            <Link to="/" className="sheet-nav-item" onClick={onClose}>
              <div className="sheet-nav-icon tech-icon">
                <Wrench size={18} />
              </div>
              <div className="sheet-nav-text">
                <span>Technician Workspace</span>
                <small>Equipment intelligence & diagnostics</small>
              </div>
            </Link>

            {auth.hasRole('supervisor', 'admin') && (
              <Link
                to="/supervisor"
                className="sheet-nav-item"
                onClick={onClose}
              >
                <div className="sheet-nav-icon sup-icon">
                  <ShieldCheck size={18} />
                </div>
                <div className="sheet-nav-text">
                  <span>Supervisor Workspace</span>
                  <small>Incident escalation & review queue</small>
                </div>
              </Link>
            )}

            {auth.hasRole('admin') && (
              <Link to="/admin" className="sheet-nav-item" onClick={onClose}>
                <div className="sheet-nav-icon admin-icon">
                  <Cpu size={18} />
                </div>
                <div className="sheet-nav-text">
                  <span>Administration Workspace</span>
                  <small>Users, facilities, assets & audit logs</small>
                </div>
              </Link>
            )}
          </div>

          <div className="sheet-footer">
            <button
              type="button"
              className="sheet-signout-btn"
              onClick={async () => {
                onClose();
                await auth.logout();
                navigate('/login', { replace: true });
              }}
            >
              <LogOut size={16} />
              <span>Sign out of FieldMate</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
