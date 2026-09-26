import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Gauge,
  MessageSquare,
  ShieldAlert,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { fetchIncidentDetail } from '../api';

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

interface IncidentDetailModalProps {
  incidentId: string | null;
  onClose: () => void;
  onSelectAsset?: (assetId: string) => void;
}

export function IncidentDetailModal({
  incidentId,
  onClose,
  onSelectAsset,
}: IncidentDetailModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (incidentId) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [incidentId, onClose]);

  const query = useQuery({
    queryKey: ['incident-detail', incidentId],
    queryFn: () => (incidentId ? fetchIncidentDetail(incidentId) : null),
    enabled: Boolean(incidentId),
  });

  if (!incidentId) return null;

  const incident = query.data;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="incident-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-container">
        <header className="modal-header">
          <div className="modal-title-group">
            <span className="modal-badge">
              {incident?.incidentNumber ?? 'INCIDENT'}
            </span>
            {incident && (
              <>
                <span className={`status-pill status-${incident.status}`}>
                  {incident.status === 'escalated'
                    ? '⚠️ Supervisor Escalated'
                    : incident.status.toUpperCase()}
                </span>
                <span className={`priority-pill priority-${incident.priority}`}>
                  {incident.priority.toUpperCase()} PRIORITY
                </span>
              </>
            )}
          </div>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close incident details"
          >
            <X size={18} />
          </button>
        </header>

        {query.isPending && (
          <div className="modal-body modal-loading" role="status">
            <div className="spinner" />
            <p>Loading incident details…</p>
          </div>
        )}

        {query.isError && (
          <div className="modal-body modal-error" role="alert">
            <AlertTriangle size={24} />
            <p>{query.error.message}</p>
            <button
              className="secondary-button"
              onClick={() => void query.refetch()}
            >
              Retry
            </button>
          </div>
        )}

        {incident && (
          <div className="modal-body">
            {/* Header Section */}
            <div className="incident-summary-section">
              <h2 id="incident-modal-title">{incident.title}</h2>
              <p className="incident-description">{incident.description}</p>

              <div className="incident-meta-row">
                {incident.asset && (
                  <button
                    className="incident-asset-tag-btn"
                    title="Focus equipment in workspace"
                    onClick={() => {
                      if (onSelectAsset && incident.asset) {
                        onSelectAsset(incident.asset.id);
                        onClose();
                      }
                    }}
                  >
                    <Wrench size={14} />
                    <span>
                      {incident.asset.assetTag} · {incident.asset.name}
                    </span>
                    <ExternalLink size={12} />
                  </button>
                )}

                {incident.faultCode && (
                  <span className="incident-fault-code-chip">
                    Fault Code: <strong>{incident.faultCode}</strong>
                  </span>
                )}

                <span className="incident-meta-item">
                  <Clock size={13} />
                  Opened {formatDateTime(incident.openedAt)}
                </span>

                {incident.openedBy && (
                  <span className="incident-meta-item">
                    <User size={13} />
                    Reported by {incident.openedBy.name}
                  </span>
                )}
              </div>
            </div>

            {/* Supervisor Escalation Banner */}
            {incident.status === 'escalated' && incident.escalations[0] && (
              <div className="modal-alert-box alert-warning" role="alert">
                <ShieldAlert size={20} />
                <div>
                  <strong>Supervisor Review Required</strong>
                  <p>{incident.escalations[0].reason}</p>
                  <small>
                    Escalated{' '}
                    {formatDateTime(incident.escalations[0].createdAt)}
                  </small>
                </div>
              </div>
            )}

            {/* Resolution & Repair Record */}
            {(incident.status === 'resolved' ||
              incident.status === 'closed' ||
              incident.rootCause ||
              incident.maintenanceRecord) && (
              <div className="incident-resolution-card">
                <div className="resolution-card-header">
                  <CheckCircle2 size={18} className="success-icon" />
                  <h3>Repair & Verification Record</h3>
                  {incident.resolvedAt && (
                    <span className="resolved-date">
                      Resolved {formatDateTime(incident.resolvedAt)}
                    </span>
                  )}
                </div>

                <div className="resolution-details-grid">
                  <div>
                    <label>ROOT CAUSE</label>
                    <p>
                      {incident.rootCause ||
                        incident.maintenanceRecord?.rootCause ||
                        'Identified and documented'}
                    </p>
                  </div>
                  <div>
                    <label>ACTION TAKEN</label>
                    <p>
                      {incident.actionTaken ||
                        incident.maintenanceRecord?.actionTaken ||
                        'Repair procedure applied'}
                    </p>
                  </div>
                </div>

                {(incident.maintenanceRecord?.verification ||
                  incident.resolutionSummary) && (
                  <div className="resolution-verification">
                    <label>POST-REPAIR VERIFICATION</label>
                    <p>
                      {incident.maintenanceRecord?.verification ||
                        incident.resolutionSummary}
                    </p>
                  </div>
                )}

                {incident.maintenanceRecord?.technician && (
                  <div className="resolution-technician">
                    <User size={13} /> Performed by{' '}
                    <strong>
                      {incident.maintenanceRecord.technician.name}
                    </strong>
                  </div>
                )}
              </div>
            )}

            {/* Linked Measurements */}
            <div className="modal-section">
              <div className="modal-section-title">
                <Gauge size={16} />
                <h3>Recorded Measurements ({incident.measurements.length})</h3>
              </div>
              {incident.measurements.length === 0 ? (
                <p className="section-empty">
                  No telemetry readings linked to this incident.
                </p>
              ) : (
                <div className="modal-readings-grid">
                  {incident.measurements.map((m) => (
                    <div key={m.id} className="reading-badge-card">
                      <span className="reading-label">
                        {m.measurementType.replaceAll('_', ' ')}
                      </span>
                      <strong className="reading-val">
                        {m.value} <small>{m.unit}</small>
                      </strong>
                      <span className="reading-time">
                        {formatDateTime(m.recordedAt)}
                      </span>
                      {m.notes && <p className="reading-note">{m.notes}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Technician Notes */}
            <div className="modal-section">
              <div className="modal-section-title">
                <MessageSquare size={16} />
                <h3>
                  Technician Notes & Observations ({incident.notes.length})
                </h3>
              </div>
              {incident.notes.length === 0 ? (
                <p className="section-empty">No field notes added yet.</p>
              ) : (
                <div className="modal-notes-list">
                  {incident.notes.map((note) => (
                    <div key={note.id} className="modal-note-item">
                      <div className="note-item-meta">
                        <span className="note-author">
                          <User size={12} />
                          {note.author?.name ?? 'Technician'}
                        </span>
                        <span className="note-time">
                          <Calendar size={12} />
                          {formatDateTime(note.createdAt)}
                        </span>
                      </div>
                      <p className="note-content">{note.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
