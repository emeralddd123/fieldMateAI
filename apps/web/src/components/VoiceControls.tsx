import { Mic, MicOff, PhoneOff, RefreshCw } from 'lucide-react';
import type { useVoiceSession } from '../voice/useVoiceSession';

export type VoiceControlsState = ReturnType<typeof useVoiceSession>;
export const voiceLabels = {
  disconnected: 'Ready to talk',
  connecting: 'Connecting…',
  listening: 'Listening',
  thinking: 'Thinking…',
  speaking: 'FieldMate is speaking',
  ending: 'Ending session…',
  error: 'Voice unavailable',
};

export function VoiceControls({ voice }: { voice: VoiceControlsState }) {
  const active = !['disconnected', 'error'].includes(voice.status);
  return (
    <>
      <section
        className={`voice-bar voice-${voice.status}`}
        aria-label="Voice session"
      >
        <div className="voice-icon" aria-hidden="true">
          {voice.muted ? <MicOff size={23} /> : <Mic size={23} />}
        </div>
        <div className="voice-summary">
          <h2 role="status">
            {voice.muted ? 'Microphone muted' : voiceLabels[voice.status]}
          </h2>
          <p>Find equipment by voice · Say “Find M-204”.</p>
          {voice.error && (
            <p className="voice-error" role="alert">
              {voice.error}
            </p>
          )}
        </div>
        <div className="voice-actions">
          {active ? (
            <>
              <button
                className="secondary-button"
                onClick={voice.toggleMute}
                disabled={
                  voice.status === 'connecting' || voice.status === 'ending'
                }
                aria-pressed={voice.muted}
              >
                {voice.muted ? <MicOff size={15} /> : <Mic size={15} />}
                {voice.muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                className="voice-button end-voice"
                onClick={voice.end}
                disabled={voice.status === 'ending'}
              >
                <PhoneOff size={15} />
                {voice.status === 'connecting'
                  ? 'Cancel connection'
                  : 'End session'}
              </button>
            </>
          ) : (
            <button className="voice-button" onClick={voice.connect}>
              {voice.status === 'error' ? (
                <RefreshCw size={15} />
              ) : (
                <Mic size={15} />
              )}
              {voice.status === 'error'
                ? 'Retry voice session'
                : 'Start voice session'}
            </button>
          )}
        </div>
      </section>
      {voice.writePrompt && (
        <section
          className="state-card safety-confirmation"
          aria-label="Review maintenance write"
        >
          <h2>{voice.writePrompt.title}</h2>
          {voice.writePrompt.details.map((detail, index) => (
            <p key={index}>{detail}</p>
          ))}
          <p>
            Saving creates a maintenance record in this demo database. Ending
            voice after submission does not undo a save.
          </p>
          <div className="voice-actions">
            <button
              className="secondary-button"
              onClick={() => voice.confirmWrite(false)}
            >
              Cancel save
            </button>
            <button
              className="voice-button"
              onClick={() => voice.confirmWrite(true)}
            >
              Confirm and save
            </button>
          </div>
        </section>
      )}
      {voice.writeNotices.length > 0 && (
        <section
          className="tool-activity"
          aria-label="Maintenance save results"
        >
          {voice.writeNotices.map((notice) => (
            <article key={notice.requestId}>
              <h3>{notice.title}</h3>
              <p role="status">{notice.message}</p>
              {notice.details.map((detail, index) => (
                <small key={index} style={{ display: 'block' }}>
                  {detail}
                </small>
              ))}
              {notice.status === 'unknown' && (
                <button
                  className="secondary-button"
                  onClick={() => voice.retryWrite(notice.requestId)}
                >
                  Check save
                </button>
              )}
            </article>
          ))}
        </section>
      )}
      {voice.safetyPrompt && (
        <section
          className="state-card safety-confirmation"
          aria-label="Procedure safety confirmation"
        >
          <h2>
            {voice.safetyPrompt.assetTag} · {voice.safetyPrompt.title}
          </h2>
          <p>{voice.safetyPrompt.message}</p>
          <p>Source: {voice.safetyPrompt.source}</p>
          <p>
            Confirm only when the equipment is stopped and in the required safe
            maintenance state under your site procedures. This confirmation
            applies to this request only.
          </p>
          <div className="voice-actions">
            <button
              className="secondary-button"
              onClick={() => voice.confirmSafety(false)}
            >
              Not ready — keep steps locked
            </button>
            <button
              className="voice-button"
              onClick={() => voice.confirmSafety(true)}
            >
              Confirm safe maintenance state
            </button>
          </div>
        </section>
      )}
    </>
  );
}
