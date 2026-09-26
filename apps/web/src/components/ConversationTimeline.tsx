import { useEffect, useRef } from 'react';
import { AudioLines, Radio } from 'lucide-react';
import { voiceLabels, type VoiceControlsState } from './VoiceControls';

export function ConversationTimeline({ voice }: { voice: VoiceControlsState }) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [voice.transcript, voice.tools]);
  return (
    <aside
      className="activity-panel conversation-panel"
      aria-label="Session activity"
    >
      <div className="activity-heading">
        <h2>
          <Radio size={16} />
          Live conversation
        </h2>
        <span className="subtle-tag">{voice.status}</span>
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
            </p>
          ))}
        </section>
      )}
      <div className="activity-footer">
        <span
          className={`status-dot ${voice.status === 'error' ? 'warning' : 'operational'}`}
        />
        {voiceLabels[voice.status]}
      </div>
    </aside>
  );
}
