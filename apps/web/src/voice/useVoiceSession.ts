import { useEffect, useRef, useState } from 'react';
import { BrowserVoiceAudio } from './audio';
import { VoiceSession, type VoiceSnapshot } from './session';
import { fetchVoiceToken } from '../api';

export function useVoiceSession() {
  const [state, setState] = useState<VoiceSnapshot>({
    status: 'disconnected',
    muted: false,
    error: null,
    sessionId: null,
    transcript: [],
  });
  const controller = useRef<VoiceSession | null>(null);
  useEffect(() => {
    const session = new VoiceSession(setState, {
      token: fetchVoiceToken,
      socket: (url) => new WebSocket(url),
      audio: (changed) => {
        if (
          !window.isSecureContext ||
          !navigator.mediaDevices?.getUserMedia ||
          !window.AudioContext ||
          !window.AudioWorkletNode
        ) {
          throw new Error(
            'Voice requires a supported browser with microphone access on HTTPS or localhost.',
          );
        }
        return new BrowserVoiceAudio(changed);
      },
    });
    controller.current = session;
    const hide = () => session.end();
    window.addEventListener('pagehide', hide);
    return () => {
      window.removeEventListener('pagehide', hide);
      session.dispose();
      controller.current = null;
    };
  }, []);
  return {
    ...state,
    connect: () => void controller.current?.connect(),
    end: () => controller.current?.end(),
    toggleMute: () => controller.current?.mute(),
  };
}
