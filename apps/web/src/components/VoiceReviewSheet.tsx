import { useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileCheck,
  Gauge,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
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
              <div className="review-details-box">
                <span className="review-box-title">RECORD DETAILS TO BE COMMITTED:</span>
                <div className="details-list">
                  {writePrompt.details.map((detail, index) => (
                    <div key={index} className="detail-item">
                      <span className="detail-bullet" />
                      <span>{detail}</span>
                    </div>
                  ))}
                </div>
              </div>

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
