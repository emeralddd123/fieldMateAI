import { SafetyConfirmation, createProcedureExecutor } from './procedure';
import type { SafetyPrompt } from './procedure';
import { useEffect, useRef, useState } from 'react';
import { BrowserVoiceAudio } from './audio';
import { VoiceSession, type VoiceSnapshot } from './session';
import {
  fetchVoiceToken,
  searchVoiceAssets,
  fetchVoiceFault,
  fetchVoiceHistory,
  fetchVoiceProcedure,
} from '../api';
import { createToolExecutor } from './tools';

export function useVoiceSession(onAssetFound: (id: string) => void) {
  const [safetyPrompt, setSafetyPrompt] = useState<SafetyPrompt | null>(null);
  const confirmation = useRef<SafetyConfirmation | null>(null);
  const [state, setState] = useState<VoiceSnapshot>({
    status: 'disconnected',
    muted: false,
    error: null,
    sessionId: null,
    transcript: [],
    tools: [],
  });
  const controller = useRef<VoiceSession | null>(null);
  useEffect(() => {
    const safety = new SafetyConfirmation(setSafetyPrompt);
    confirmation.current = safety;
    const session = new VoiceSession(setState, {
      token: fetchVoiceToken,
      executeTool: createToolExecutor(
        searchVoiceAssets,
        {
          fault: fetchVoiceFault,
          history: fetchVoiceHistory,
        },
        createProcedureExecutor(fetchVoiceProcedure, (prompt, signal) =>
          safety.request(prompt, signal),
        ),
      ),
      assetFound: onAssetFound,
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
      safety.answer(false);
      confirmation.current = null;
      controller.current = null;
    };
  }, [onAssetFound]);
  return {
    ...state,
    safetyPrompt,
    confirmSafety: (accepted: boolean) =>
      confirmation.current?.answer(accepted),
    connect: () => void controller.current?.connect(),
    end: () => controller.current?.end(),
    toggleMute: () => controller.current?.mute(),
  };
}
