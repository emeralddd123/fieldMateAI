import { FileText, Trash2, X } from 'lucide-react';
import { formatDraftAge } from '../utils/draftStorage';

interface DraftRestorationNoticeProps {
  ageMinutes: number;
  onDiscard: () => void;
  onDismiss?: () => void;
}

export function DraftRestorationNotice({
  ageMinutes,
  onDiscard,
  onDismiss,
}: DraftRestorationNoticeProps) {
  return (
    <div
      className="draft-restoration-notice"
      role="alert"
      aria-live="polite"
    >
      <div className="draft-notice-content">
        <FileText size={16} className="draft-notice-icon" />
        <div className="draft-notice-text">
          <strong>Unsubmitted Draft Restored</strong>
          <span>
            Saved {formatDraftAge(ageMinutes)}. Review and confirm entries before submitting.
          </span>
        </div>
      </div>
      <div className="draft-notice-actions">
        <button
          type="button"
          className="draft-discard-btn"
          onClick={onDiscard}
          title="Discard this draft and start fresh"
        >
          <Trash2 size={13} /> Discard
        </button>
        {onDismiss && (
          <button
            type="button"
            className="draft-dismiss-btn"
            onClick={onDismiss}
            aria-label="Keep draft and dismiss notice"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
