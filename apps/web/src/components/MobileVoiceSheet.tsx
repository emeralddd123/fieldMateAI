import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  AudioLines,
  ChevronDown,
  Cpu,
  FileCheck,
  Mic,
  MicOff,
  PhoneOff,
  Radio,
  RefreshCw,
  Send,
  ShieldAlert,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import type { VoiceControlsState } from './VoiceControls';
import { voiceLabels } from './VoiceControls';

export interface MobileVoiceSheetProps {
  isOpen: boolean;
  onClose: () => void;
  voice: VoiceControlsState;
  activeAssetTag?: string;
  activeAssetName?: string;
}

export function MobileVoiceSheet({
  isOpen,
  onClose,
  voice,
  activeAssetTag,
  activeAssetName,
}: MobileVoiceSheetProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [typedInput, setTypedInput] = useState('');
  const [showTypedInput, setShowTypedInput] = useState(false);

  const isActive = !['disconnected', 'error'].includes(voice.status);
  const isListening = voice.status === 'listening' && !voice.muted;
  const isSpeaking = voice.status === 'speaking';
  const isThinking = voice.status === 'thinking';

  // Auto-scroll transcript when new items arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [voice.transcript, voice.tools]);

  const quickPrompts = [
    `Lookup specs for ${activeAssetTag ?? 'M-204'}`,
    `Report high vibration on ${activeAssetTag ?? 'M-204'}`,
    `Check fault code E-04`,
    `Record current 12.8A on ${activeAssetTag ?? 'M-204'}`,
  ];

  if (!isOpen) return null;

  return (
    <div
      className="mobile-voice-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="FieldMate Voice Copilot"
    >
      <div className="mobile-voice-sheet-container">
        {/* Sheet Top Header */}
        <header className="mobile-voice-header">
          <div className="voice-header-meta">
            <div className="voice-machine-pill">
              <Cpu size={14} />
              <strong>{activeAssetTag ?? 'M-204'}</strong>
              {activeAssetName && <span className="machine-name-trunc">{activeAssetName}</span>}
            </div>
            <div className={`voice-live-badge status-${voice.status}`}>
              <span className="live-dot" />
              <span>{voice.muted ? 'Muted' : voiceLabels[voice.status]}</span>
            </div>
          </div>

          <div className="voice-header-actions">
            {isActive && (
              <button
                type="button"
                className={`voice-head-btn ${voice.muted ? 'muted-active' : ''}`}
                onClick={voice.toggleMute}
                title={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
                aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
              >
                {voice.muted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            )}
            <button
              type="button"
              className="voice-head-btn close-btn"
              onClick={onClose}
              title="Minimize voice session"
              aria-label="Minimize voice session"
            >
              <ChevronDown size={20} />
            </button>
          </div>
        </header>

        {/* Pinned Review Banner if Write or Safety prompt is pending */}
        {(voice.writePrompt || voice.safetyPrompt) && (
          <div className="pinned-review-banner">
            <div className="banner-left">
              {voice.safetyPrompt ? (
                <ShieldAlert size={18} className="banner-icon-safety" />
              ) : (
                <FileCheck size={18} className="banner-icon-write" />
              )}
              <div>
                <strong>
                  {voice.safetyPrompt ? 'Safety Verification Required' : 'Review Maintenance Write'}
                </strong>
                <small>
                  {voice.safetyPrompt
                    ? `${voice.safetyPrompt.assetTag} safe-state checklist`
                    : voice.writePrompt?.title}
                </small>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Conversation Transcript & Tool Lookups */}
        <div className="mobile-voice-body" ref={scrollRef}>
          {voice.transcript.length === 0 ? (
            <div className="voice-intro-screen">
              <div className="intro-halo">
                <AudioLines size={36} />
              </div>
              <h3>FieldMate Voice Intelligence</h3>
              <p>
                Speak naturally or tap a quick question below. Ask for machine specifications,
                fault codes, or record repair notes hands-free.
              </p>

              <div className="quick-prompts-grid">
                <span className="prompts-heading">SUGGESTED COMMANDS:</span>
                {quickPrompts.map((prompt, i) => (
                  <button
                    key={i}
                    type="button"
                    className="quick-prompt-chip"
                    onClick={() => {
                      if (!isActive) voice.connect();
                    }}
                  >
                    <Sparkles size={12} />
                    <span>&ldquo;{prompt}&rdquo;</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="transcript-chat-list">
              {voice.transcript.map((item) => (
                <div
                  key={item.id}
                  className={`chat-bubble-row ${item.speaker === 'user' ? 'bubble-user' : 'bubble-agent'}`}
                >
                  <div className="chat-bubble">
                    <span className="speaker-tag">
                      {item.speaker === 'user' ? 'You' : 'FieldMate AI'}
                    </span>
                    <p className="bubble-text">{item.text}</p>
                    {!item.final && <span className="bubble-speaking-dot">● Listening…</span>}
                    {item.interrupted && <span className="bubble-interrupted">Interrupted</span>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Real-time Tool Activity Box */}
          {voice.tools.length > 0 && (
            <div className="live-tool-tray">
              <span className="tray-title">EQUIPMENT LOOKUPS & BACKGROUND REASONING</span>
              {voice.tools.slice(-3).map((tool) => (
                <div key={tool.id} className={`tool-pill status-${tool.status}`}>
                  <span className="tool-status-dot" />
                  <span className="tool-summary">{tool.summary}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Thumb-Zone Voice Control Dock */}
        <footer className="mobile-voice-dock">
          {/* Waveform & Status feedback */}
          <div className="voice-status-indicator">
            {isSpeaking && (
              <div className="speaking-wave-bars">
                <span />
                <span />
                <span />
                <span />
                <span />
              </div>
            )}
            <span className="status-caption">
              {voice.error
                ? voice.error
                : voice.muted
                  ? 'Microphone muted · Tap to unmute'
                  : isListening
                    ? 'Listening… speak anytime'
                    : isSpeaking
                      ? 'FieldMate speaking'
                      : isThinking
                        ? 'Looking up equipment records…'
                        : isActive
                          ? 'Voice copilot active'
                          : 'Tap microphone to start'}
            </span>
          </div>

          {/* Central Thumb Action Controls */}
          <div className="voice-dock-controls">
            {isActive ? (
              <>
                <button
                  type="button"
                  className="dock-sub-btn mute-sub-btn"
                  onClick={voice.toggleMute}
                  aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {voice.muted ? <MicOff size={20} /> : <Mic size={20} />}
                  <span>{voice.muted ? 'Unmute' : 'Mute'}</span>
                </button>

                <button
                  type="button"
                  className={`dock-main-mic-btn ${isListening ? 'listening' : ''} ${isSpeaking ? 'speaking' : ''}`}
                  onClick={() => {
                    // Tap central mic button to toggle listening or speak
                    if (voice.muted) voice.toggleMute();
                  }}
                  aria-label="Active voice copilot"
                >
                  <div className="dock-pulse-outer" />
                  <div className="dock-mic-core">
                    <Mic size={28} />
                  </div>
                </button>

                <button
                  type="button"
                  className="dock-sub-btn end-sub-btn"
                  onClick={voice.end}
                  aria-label="End voice session"
                >
                  <PhoneOff size={20} />
                  <span>End</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="dock-start-btn"
                onClick={voice.connect}
              >
                <Mic size={22} />
                <span>Start Voice Copilot</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
