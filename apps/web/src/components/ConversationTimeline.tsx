import { useEffect, useRef } from 'react';
import {
  AudioLines,
  Radio,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { voiceLabels, type VoiceControlsState } from './VoiceControls';

export function ConversationTimeline({ voice }: { voice: VoiceControlsState }) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [voice.transcript, voice.tools]);

  const isActive = !['disconnected', 'error'].includes(voice.status);
  const isConnecting = voice.status === 'connecting';
  const isError = voice.status === 'error';

  return (
    <aside
      className="activity-panel conversation-panel"
      aria-label="Session activity"
    >
      <div className="activity-heading">
        <h2>
          <Radio size={16} className={isActive ? 'pulse-icon' : ''} />
          Live conversation
        </h2>
        <div className="activity-heading-actions">
          {isActive ? (
            <div className="timeline-header-controls">
              <button
                type="button"
                className={`timeline-ctrl-btn ${voice.muted ? 'is-muted' : ''}`}
                onClick={voice.toggleMute}
                disabled={isConnecting || voice.status === 'ending'}
                title={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
                aria-pressed={voice.muted}
                aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {voice.muted ? <MicOff size={13} /> : <Mic size={13} />}
              </button>
              <button
                type="button"
                className="timeline-ctrl-btn end-btn"
                onClick={voice.end}
                disabled={voice.status === 'ending'}
                title="End session"
                aria-label="End voice session"
              >
                <PhoneOff size={13} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="timeline-header-start-btn"
              onClick={voice.connect}
              disabled={isConnecting}
              title={isError ? 'Retry voice session' : 'Start voice session'}
            >
              {isError ? <RefreshCw size={12} /> : <Mic size={12} />}
              <span>{isError ? 'Retry' : 'Start'}</span>
            </button>
          )}
          <span className={`subtle-tag ${isActive ? 'tag-active' : ''}`}>
            {voice.status}
          </span>
        </div>
      </div>
      <div
        className="conversation-log"
        ref={scroll}
        role="log"
        aria-label="Conversation transcript"
        aria-relevant="additions text"
      >
        {voice.transcript.length ? (
          voice.transcript.map((item) => (
            <article
              className={`transcript-item transcript-${item.speaker}`}
              key={item.id}
            >
              <strong>{item.speaker === 'user' ? 'You' : 'FieldMate'}</strong>
              <p>{item.text}</p>
              {!item.final && <small>Speaking…</small>}
              {item.interrupted && <small>Interrupted</small>}
            </article>
          ))
        ) : (
          <div className="session-empty">
            <span className="conversation-symbol">
              <AudioLines size={29} />
            </span>
            <h3>
              Your conversation,
              <br />
              in real time.
            </h3>
            <p>
              Start a voice session to talk with FieldMate. Your words and
              responses will appear here.
            </p>
            <button
              type="button"
              className="session-start-cta-btn"
              onClick={voice.connect}
              disabled={isConnecting || voice.status === 'ending'}
              title="Start voice session"
            >
              {isConnecting ? (
                <>
                  <Loader2 size={16} className="spin-icon" />
                  <span>Connecting…</span>
                </>
              ) : isError ? (
                <>
                  <RefreshCw size={16} />
                  <span>Retry voice session</span>
                </>
              ) : (
                <>
                  <Mic size={16} />
                  <span>Start voice session</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
      {voice.tools.length > 0 && (
        <section className="tool-activity" aria-label="Equipment lookups">
          <h3>Equipment lookups</h3>
          {voice.tools.slice(-5).map((tool) => (
            <p key={tool.id} role="status" className={`tool-${tool.status}`}>
              <strong>
                {tool.status === 'running'
                  ? 'Searching'
                  : tool.status === 'completed'
                    ? 'Result'
                    : tool.status === 'cancelled'
                      ? 'Cancelled'
                      : 'Unavailable'}
              </strong>
              <span>{tool.summary}</span>
              {tool.details?.map((detail, index) => (
                <span key={index}>{detail}</span>
              ))}
              {tool.source && <small>Source: {tool.source}</small>}
            </p>
          ))}
        </section>
      )}
      <div className="activity-footer">
        <span
          className={`status-dot ${voice.status === 'error' ? 'warning' : 'operational'}`}
        />
        <span className="activity-footer-label">{voiceLabels[voice.status]}</span>
        {!isActive && (
          <button
            type="button"
            className="activity-footer-quick-link"
            onClick={voice.connect}
            title="Start voice session"
          >
            Start voice
          </button>
        )}
      </div>
    </aside>
  );
}
