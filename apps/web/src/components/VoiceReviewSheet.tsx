import { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileCheck,
  FileText,
  Gauge,
  Lock,
  MessageSquare,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Wrench,
  X,
} from 'lucide-react';
import type { VoiceControlsState } from './VoiceControls';

export function VoiceReviewSheet({ voice }: { voice: VoiceControlsState }) {
  const writePrompt = voice.writePrompt;
  const safetyPrompt = voice.safetyPrompt;
  const recentNotices = voice.writeNotices.slice(-1);
  const latestNotice = recentNotices[0];

  // If there's neither a pending write nor safety prompt, don't show the review sheet
  if (!writePrompt && !safetyPrompt) {
    return null;
  }

  return (
    <div
      className="mobile-sheet-backdrop persistent-review-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Maintenance write or safety confirmation"
    >
      <div className="voice-review-sheet">
        <div className="mobile-sheet-handle" />

        {/* Safety Gate Confirmation */}
        {safetyPrompt && (
          <div className="safety-gate-card">
            <div className="review-sheet-header safety-header">
              <div className="sheet-badge-wrap">
                <ShieldAlert size={22} className="safety-alert-icon" />
                <div>
                  <span className="review-eyebrow">SAFETY GATE CONFIRMATION</span>
                  <h2>{safetyPrompt.title}</h2>
                </div>
              </div>
              <span className="machine-pill">
                <Cpu size={13} />
                {safetyPrompt.assetTag}
              </span>
            </div>

            <div className="review-sheet-body">
              <div className="safety-warning-banner">
                <AlertOctagon size={18} />
                <div>
                  <strong>Mandatory Equipment Safe State Verification</strong>
                  <p>{safetyPrompt.message}</p>
                </div>
              </div>

              <div className="safety-checklist">
                <div className="checklist-item">
                  <div className="checklist-bullet">1</div>
                  <span>Equipment is fully stopped, de-energized, and zero energy verified.</span>
                </div>
                <div className="checklist-item">
                  <div className="checklist-bullet">2</div>
                  <span>Lockout / Tagout (LOTO) padlocks and tags applied as per site policy.</span>
                </div>
                <div className="checklist-item">
                  <div className="checklist-bullet">3</div>
                  <span>Mandatory PPE donned (safety goggles, arc flash, or protective gloves).</span>
                </div>
              </div>

              <div className="safety-source-note">
                <small>Source: {safetyPrompt.source}</small>
                <small>This confirmation applies only to this specific procedure execution.</small>
              </div>
            </div>

            <div className="review-sheet-actions">
              <button
                type="button"
                className="review-btn-cancel"
                onClick={() => voice.confirmSafety(false)}
              >
                <Lock size={15} />
                <span>Not ready — keep steps locked</span>
              </button>
              <button
                type="button"
                className="review-btn-confirm safety-confirm"
                onClick={() => voice.confirmSafety(true)}
              >
                <ShieldCheck size={16} />
                <span>Confirm safe maintenance state</span>
              </button>
            </div>
          </div>
        )}

        {/* Maintenance Write Review */}
        {!safetyPrompt && writePrompt && (
          <div className="write-review-card">
            <div className="review-sheet-header write-header">
              <div className="sheet-badge-wrap">
                <FileCheck size={22} className="write-icon" />
                <div>
                  <span className="review-eyebrow">CONFIRM MAINTENANCE WRITE</span>
                  <h2>{writePrompt.title}</h2>
                </div>
              </div>
            </div>

            <div className="review-sheet-body">
              <ReviewDetailsContent title={writePrompt.title} details={writePrompt.details} />

              <div className="review-safety-notice">
                <AlertTriangle size={15} />
                <p>
                  Confirming commits this record to the institutional plant database.
                  Closing voice assistance after submission does not undo this save.
                </p>
              </div>
            </div>

            <div className="review-sheet-actions">
              <button
                type="button"
                className="review-btn-cancel"
                onClick={() => voice.confirmWrite(false)}
              >
                <X size={15} />
                <span>Cancel save</span>
              </button>
              <button
                type="button"
                className="review-btn-confirm write-confirm"
                onClick={() => voice.confirmWrite(true)}
              >
                <CheckCircle2 size={16} />
                <span>Confirm and save record</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function WriteReceiptNotice({
  notices,
  onRetry,
}: {
  notices: VoiceControlsState['writeNotices'];
  onRetry: (requestId: string) => void;
}) {
  if (!notices.length) return null;
  const latest = notices[notices.length - 1];
  if (!latest) return null;

  return (
    <div
      className={`receipt-toast ${latest.status === 'unknown' ? 'status-unknown' : 'status-saved'}`}
      role="status"
    >
      <div className="receipt-toast-header">
        <div className="toast-title-wrap">
          <CheckCircle2 size={16} />
          <strong>{latest.title}</strong>
        </div>
        <span className="toast-id">ID: {latest.requestId.slice(0, 8)}</span>
      </div>
      <p className="toast-msg">{latest.message}</p>
      {latest.details.length > 0 && (
        <div className="toast-details">
          {latest.details.map((d, i) => (
            <small key={i}>{d}</small>
          ))}
        </div>
      )}
      {latest.status === 'unknown' && (
        <button
          type="button"
          className="receipt-retry-btn"
          onClick={() => onRetry(latest.requestId)}
        >
          <RotateCcw size={13} />
          <span>Verify save status</span>
        </button>
      )}
    </div>
  );
}

function ReviewDetailsContent({ title, details }: { title: string; details: string[] }) {
  const lowerTitle = title.toLowerCase();
  const isNote = lowerTitle.includes('note');
  const isIncident = lowerTitle.includes('incident') && !isNote && !lowerTitle.includes('escalat');
  const isMeasurement = lowerTitle.includes('measurement');
  const isResolution = lowerTitle.includes('resolution') || lowerTitle.includes('repair');

  if (isNote) {
    const incidentLine = details.find((d) => d.startsWith('Incident:'))?.replace(/^Incident:\s*/, '') ?? '';
    const noteLine = details.find((d) => d.startsWith('Note:'))?.replace(/^Note:\s*/, '') ?? details.join('\n');

    return (
      <div className="review-custom-card review-note-card">
        <div className="review-card-top">
          <span className="review-card-badge note-badge">
            <MessageSquare size={13} />
            <span>FIELD NOTE / OBSERVATION</span>
          </span>
          {incidentLine && (
            <span className="review-incident-ref" title={incidentLine}>
              <Tag size={12} />
              <strong>{incidentLine}</strong>
            </span>
          )}
        </div>
        <div className="review-note-bubble">
          <span className="quote-mark">&ldquo;</span>
          <p className="note-text-highlight">{noteLine}</p>
        </div>
        <div className="review-card-footer">
          <span className="note-audit-tag">
            <FileText size={12} />
            <span>Appends to immutable incident logbook</span>
          </span>
        </div>
      </div>
    );
  }

  if (isIncident) {
    const titleVal = details.find((d) => d.startsWith('Title:'))?.replace(/^Title:\s*/, '') ?? '';
    const descVal = details.find((d) => d.startsWith('Description:'))?.replace(/^Description:\s*/, '') ?? '';
    const faultVal = details.find((d) => d.startsWith('Fault:'))?.replace(/^Fault:\s*/, '') ?? '';
    const priorityVal = details.find((d) => d.startsWith('Priority:'))?.replace(/^Priority:\s*/, '') ?? 'medium';
    const statusVal = details.find((d) => d.startsWith('Equipment status:'))?.replace(/^Equipment status:\s*/, '') ?? '';
    const linkedReadings = details.filter((d) => d.startsWith('Link reading:'));

    return (
      <div className="review-custom-card review-incident-card">
        <div className="review-card-top">
          <div className="incident-pills-row">
            <span className={`priority-chip priority-${priorityVal.toLowerCase()}`}>
              <AlertTriangle size={12} />
              <span>{priorityVal.toUpperCase()} PRIORITY</span>
            </span>
            {statusVal && (
              <span className={`status-chip status-${statusVal.toLowerCase().includes('down') ? 'down' : 'warning'}`}>
                <Activity size={12} />
                <span>{statusVal.toUpperCase()}</span>
              </span>
            )}
          </div>
        </div>

        <div className="incident-title-block">
          <h3>{titleVal || 'Equipment Incident'}</h3>
          {faultVal && (
            <div className="incident-fault-pill">
              <Tag size={12} />
              <span>{faultVal}</span>
            </div>
          )}
        </div>

        {descVal && (
          <div className="incident-desc-block">
            <span className="sub-label">SYMPTOM & OBSERVATIONS</span>
            <p>{descVal}</p>
          </div>
        )}

        {linkedReadings.length > 0 && (
          <div className="incident-readings-block">
            <span className="sub-label">ATTACHED VERIFICATION READINGS ({linkedReadings.length})</span>
            <div className="readings-badges-list">
              {linkedReadings.map((r, i) => (
                <span key={i} className="attached-reading-badge">
                  <Gauge size={12} />
                  <span>{r.replace(/^Link reading:\s*/, '')}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isMeasurement) {
    const assetVal = details.find((d) => d.startsWith('Asset:'))?.replace(/^Asset:\s*/, '') ?? '';
    const recordVal = details.find((d) => d.startsWith('Record:'))?.replace(/^Record:\s*/, '') ?? details[0] ?? '';
    const attachVal = details.find((d) => d.startsWith('Attach to incident:'))?.replace(/^Attach to incident:\s*/, '') ?? '';
    const noteVal = details.find((d) => d.startsWith('Notes:'))?.replace(/^Notes:\s*/, '') ?? '';

    return (
      <div className="review-custom-card review-measurement-card">
        <div className="review-card-top">
          <span className="review-card-badge measurement-badge">
            <Gauge size={13} />
            <span>TELEMETRY MEASUREMENT</span>
          </span>
          {assetVal && (
            <span className="review-asset-pill">
              <Cpu size={12} />
              <span>{assetVal}</span>
            </span>
          )}
        </div>

        <div className="measurement-digital-display">
          <span className="digital-value">{recordVal}</span>
        </div>

        {attachVal && (
          <div className="measurement-attachment">
            <Tag size={12} />
            <span>Linked to incident: <strong>{attachVal}</strong></span>
          </div>
        )}

        {noteVal && (
          <div className="measurement-note">
            <small>Note: {noteVal}</small>
          </div>
        )}
      </div>
    );
  }

  if (isResolution) {
    const incVal = details.find((d) => d.startsWith('Incident:'))?.replace(/^Incident:\s*/, '') ?? '';
    const rootVal = details.find((d) => d.startsWith('Root cause:'))?.replace(/^Root cause:\s*/, '') ?? '';
    const actionVal = details.find((d) => d.startsWith('Action taken:'))?.replace(/^Action taken:\s*/, '') ?? '';
    const verifyVal = details.find((d) => d.startsWith('Verification:'))?.replace(/^Verification:\s*/, '') ?? '';

    return (
      <div className="review-custom-card review-resolution-card">
        <div className="review-card-top">
          <span className="review-card-badge resolution-badge">
            <Wrench size={13} />
            <span>COMPLETED REPAIR RECORD</span>
          </span>
          {incVal && (
            <span className="review-incident-ref">
              <strong>{incVal}</strong>
            </span>
          )}
        </div>

        <div className="resolution-fields-grid">
          <div className="resolution-field">
            <span className="field-lbl">ROOT CAUSE</span>
            <p>{rootVal || 'Diagnosed and verified'}</p>
          </div>
          <div className="resolution-field">
            <span className="field-lbl">ACTION TAKEN</span>
            <p>{actionVal || 'Repaired and restored'}</p>
          </div>
          {verifyVal && (
            <div className="resolution-field full-width">
              <span className="field-lbl">VERIFICATION</span>
              <p>{verifyVal}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Fallback to clean key-value pairs
  return (
    <div className="review-details-box">
      <span className="review-box-title">RECORD DETAILS TO BE COMMITTED:</span>
      <div className="details-list">
        {details.map((detail, index) => (
          <div key={index} className="detail-item">
            <span className="detail-bullet" />
            <span>{detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
