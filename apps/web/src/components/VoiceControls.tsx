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
        <p>Voice conversation · Maintenance actions will be connected next.</p>
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
  );
}
