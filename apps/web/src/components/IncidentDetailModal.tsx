import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import {
  fetchIncidentDetail,
  fetchSupervisorUsers,
  submitSupervisorReview,
  submitIncidentNote,
  submitIncidentEscalation,
  type IncidentDetail,
} from '../api';
import { RepairCompletionModal } from './RepairCompletionModal';

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

function SupervisorReviewForm({
  incident,
  onUpdated,
}: {
  incident: IncidentDetail;
  onUpdated?: () => void;
}) {
  const queryClient = useQueryClient();
  const [assignedToId, setAssignedToId] = useState(
    incident.assignedTo?.id ?? '',
  );
  const [priority, setPriority] = useState<IncidentDetail['priority']>(
    incident.priority,
  );
  const [supervisorNote, setSupervisorNote] = useState('');
  const [reviewStatus, setReviewStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [reviewMessage, setReviewMessage] = useState('');
  const siteId = (incident.asset as { siteId?: string } | undefined)?.siteId;
  const users = useQuery({
    queryKey: ['supervisor-users', siteId],
    queryFn: () => fetchSupervisorUsers(siteId),
  });
  const pendingEscalation = incident.escalations.find(
    (escalation) => escalation.status === 'pending',
  );
  const originalAssignedToId = incident.assignedTo?.id ?? '';
  const reviewChanged = Boolean(
    pendingEscalation ||
    supervisorNote.trim() ||
    priority !== incident.priority ||
    assignedToId !== originalAssignedToId,
  );

  const saveSupervisorReview = async () => {
    if (!reviewChanged) return;
    setReviewStatus('saving');
    setReviewMessage('');
    try {
      const updated = await submitSupervisorReview(incident.id, {
        acknowledgeEscalation: Boolean(pendingEscalation),
        assignedToId:
          assignedToId === originalAssignedToId
            ? undefined
            : assignedToId || null,
        priority: priority === incident.priority ? undefined : priority,
        note: supervisorNote.trim() || undefined,
      });
      queryClient.setQueryData(['incident-detail', incident.id], updated);
      await queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setAssignedToId(updated.assignedTo?.id ?? '');
      setPriority(updated.priority);
      setSupervisorNote('');
      setReviewStatus('saved');
      setReviewMessage(
        pendingEscalation
          ? 'Escalation acknowledged and supervisor review saved.'
          : 'Supervisor review saved.',
      );
      onUpdated?.();
    } catch (error) {
      setReviewStatus('error');
      setReviewMessage(
        error instanceof Error
          ? error.message
          : 'The supervisor review could not be saved.',
      );
    }
  };

  return (
    <section
      className="supervisor-review-form"
      aria-label="Supervisor review actions"
    >
      <div className="supervisor-review-heading">
        <div>
          <span className="panel-kicker">SUPERVISOR ACTION</span>
          <h3>
            {pendingEscalation
              ? 'Acknowledge and route this escalation'
              : 'Update incident ownership'}
          </h3>
        </div>
        {pendingEscalation && (
          <span className="count-pill">Pending review</span>
        )}
      </div>
      <div className="supervisor-review-fields">
        <label>
          <span>ASSIGN TO</span>
          <select
            value={assignedToId}
            onChange={(event) => setAssignedToId(event.target.value)}
            disabled={users.isPending || reviewStatus === 'saving'}
          >
            <option value="">Unassigned</option>
            {users.data?.map((user) => (
              <option value={user.id} key={user.id}>
                {user.name} · {user.role}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>PRIORITY</span>
          <select
            value={priority}
            onChange={(event) =>
              setPriority(event.target.value as IncidentDetail['priority'])
            }
            disabled={reviewStatus === 'saving'}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
      </div>
      <label className="supervisor-note-field">
        <span>SUPERVISOR NOTE</span>
        <textarea
          value={supervisorNote}
          onChange={(event) => setSupervisorNote(event.target.value)}
          placeholder="Add routing instructions or a review note…"
          maxLength={4000}
          disabled={reviewStatus === 'saving'}
        />
      </label>
      <div className="supervisor-review-footer">
        <p
          className={`supervisor-review-message ${reviewStatus}`}
          role={reviewStatus === 'error' ? 'alert' : 'status'}
        >
          {reviewMessage ||
            (pendingEscalation
              ? 'Acknowledgement records the demo supervisor and review time.'
              : 'Save any assignment, priority, or note changes.')}
        </p>
        <button
          className="voice-button"
          onClick={() => void saveSupervisorReview()}
          disabled={!reviewChanged || reviewStatus === 'saving'}
        >
          {reviewStatus === 'saving'
            ? 'Saving review…'
            : pendingEscalation
              ? 'Acknowledge and save'
              : 'Save supervisor update'}
        </button>
      </div>
    </section>
  );
}

interface IncidentDetailModalProps {
  incidentId: string | null;
  onClose: () => void;
  onSelectAsset?: (assetId: string) => void;
  supervisorMode?: boolean;
  onSupervisorUpdated?: () => void;
}

export function IncidentDetailModal({
  incidentId,
  onClose,
  onSelectAsset,
  supervisorMode = false,
  onSupervisorUpdated,
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

  const queryClient = useQueryClient();

  // Action Dialog States
  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const [isEscalateOpen, setIsEscalateOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [escalateSeverity, setEscalateSeverity] = useState<'supervisor_review' | 'urgent'>('supervisor_review');
  const [isSubmittingEscalation, setIsSubmittingEscalation] = useState(false);
  const [escalateError, setEscalateError] = useState<string | null>(null);

  const [isCompleteRepairOpen, setIsCompleteRepairOpen] = useState(false);

  if (!incidentId) return null;

  const incident = query.data;
  const currentEscalation = incident?.escalations[0];
  const pendingEscalation = incident?.escalations.find(
    (escalation) => escalation.status === 'pending',
  );

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !incident) return;
    setIsSubmittingNote(true);
    setNoteError(null);
    try {
      await submitIncidentNote(incident.id, newNote.trim());
      await queryClient.invalidateQueries({ queryKey: ['incident-detail', incident.id] });
      await queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setNewNote('');
      setIsAddNoteOpen(false);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleEscalate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!escalateReason.trim() || !incident) return;
    setIsSubmittingEscalation(true);
    setEscalateError(null);
    try {
      await submitIncidentEscalation(incident.id, escalateReason.trim(), escalateSeverity);
      await queryClient.invalidateQueries({ queryKey: ['incident-detail', incident.id] });
      await queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setEscalateReason('');
      setIsEscalateOpen(false);
    } catch (err) {
      setEscalateError(err instanceof Error ? err.message : 'Failed to escalate incident');
    } finally {
      setIsSubmittingEscalation(false);
    }
  };

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
            {incident.status === 'escalated' && currentEscalation && (
              <div
                className={`modal-alert-box ${pendingEscalation ? 'alert-warning' : 'alert-reviewed'}`}
                role="status"
              >
                <ShieldAlert size={20} />
                <div>
                  <strong>
                    {pendingEscalation
                      ? 'Supervisor Review Required'
                      : 'Escalation Acknowledged'}
                  </strong>
                  <p>{currentEscalation.reason}</p>
                  <small>
                    {currentEscalation.acknowledgedAt
                      ? `Reviewed by ${currentEscalation.acknowledgedBy?.name ?? 'Supervisor'} · ${formatDateTime(currentEscalation.acknowledgedAt)}`
                      : `Escalated ${formatDateTime(currentEscalation.createdAt)}`}
                  </small>
                </div>
              </div>
            )}

            {supervisorMode &&
              ['open', 'investigating', 'escalated'].includes(
                incident.status,
              ) && (
                <SupervisorReviewForm
                  key={incident.id}
                  incident={incident}
                  onUpdated={onSupervisorUpdated}
                />
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

        {/* Sticky Mobile-First Action Bar for Active Incidents */}
        {incident && ['open', 'investigating', 'escalated'].includes(incident.status) && (
          <footer className="incident-sticky-actions-bar">
            <button
              type="button"
              className="incident-action-btn btn-note"
              onClick={() => setIsAddNoteOpen(true)}
            >
              <MessageSquare size={16} />
              <span>Add Note</span>
            </button>

            <button
              type="button"
              className="incident-action-btn btn-escalate"
              onClick={() => setIsEscalateOpen(true)}
            >
              <ShieldAlert size={16} />
              <span>Escalate</span>
            </button>

            <button
              type="button"
              className="incident-action-btn btn-complete-repair"
              onClick={() => setIsCompleteRepairOpen(true)}
            >
              <CheckCircle2 size={16} />
              <span>Complete Repair</span>
            </button>
          </footer>
        )}
      </div>

      {/* Add Note Sub-Modal */}
      {isAddNoteOpen && incident && (
        <div
          className="modal-backdrop sub-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Add field note"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddNoteOpen(false);
          }}
        >
          <div className="sub-modal-card">
            <div className="sub-modal-header">
              <div className="sub-modal-badge">
                <MessageSquare size={14} />
                <span>ADD OBSERVATION NOTE</span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsAddNoteOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleAddNote}>
              <div className="sub-modal-body">
                {noteError && (
                  <div className="sub-modal-error">
                    <AlertTriangle size={14} />
                    <span>{noteError}</span>
                  </div>
                )}
                <label className="sub-modal-label">Technician Note:</label>
                <textarea
                  className="sub-modal-textarea"
                  rows={4}
                  placeholder="Record symptoms, measured values, or observations…"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="sub-modal-footer">
                <button
                  type="button"
                  className="sub-modal-cancel"
                  onClick={() => setIsAddNoteOpen(false)}
                  disabled={isSubmittingNote}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sub-modal-submit"
                  disabled={isSubmittingNote || !newNote.trim()}
                >
                  {isSubmittingNote ? 'Saving…' : 'Save Field Note'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Escalate Sub-Modal */}
      {isEscalateOpen && incident && (
        <div
          className="modal-backdrop sub-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Escalate incident to supervisor"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsEscalateOpen(false);
          }}
        >
          <div className="sub-modal-card">
            <div className="sub-modal-header">
              <div className="sub-modal-badge warning-badge">
                <ShieldAlert size={14} />
                <span>ESCALATE TO SUPERVISOR</span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsEscalateOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleEscalate}>
              <div className="sub-modal-body">
                {escalateError && (
                  <div className="sub-modal-error">
                    <AlertTriangle size={14} />
                    <span>{escalateError}</span>
                  </div>
                )}
                <label className="sub-modal-label">Escalation Severity:</label>
                <div className="severity-toggle-row">
                  <button
                    type="button"
                    className={`severity-btn ${escalateSeverity === 'supervisor_review' ? 'selected' : ''}`}
                    onClick={() => setEscalateSeverity('supervisor_review')}
                  >
                    Supervisor Review
                  </button>
                  <button
                    type="button"
                    className={`severity-btn urgent ${escalateSeverity === 'urgent' ? 'selected' : ''}`}
                    onClick={() => setEscalateSeverity('urgent')}
                  >
                    Urgent / Plant Impact
                  </button>
                </div>

                <label className="sub-modal-label">Reason for Escalation:</label>
                <textarea
                  className="sub-modal-textarea"
                  rows={4}
                  placeholder="Explain why supervisor review, parts authorization, or specialist help is required…"
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="sub-modal-footer">
                <button
                  type="button"
                  className="sub-modal-cancel"
                  onClick={() => setIsEscalateOpen(false)}
                  disabled={isSubmittingEscalation}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="sub-modal-submit escalate-submit"
                  disabled={isSubmittingEscalation || !escalateReason.trim()}
                >
                  {isSubmittingEscalation ? 'Escalating…' : 'Submit Escalation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stepped Repair Completion Modal */}
      {isCompleteRepairOpen && incident && (
        <RepairCompletionModal
          isOpen={isCompleteRepairOpen}
          onClose={() => setIsCompleteRepairOpen(false)}
          incident={incident}
          onCompleted={() => {
            void query.refetch();
          }}
        />
      )}
    </div>
  );
}
