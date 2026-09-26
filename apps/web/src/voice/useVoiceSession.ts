import { useQueryClient } from '@tanstack/react-query';
import { VoiceWrites } from './writes';
import type { WritePrompt, WriteNotice } from './writes';
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
  previewVoiceWrite,
  submitVoiceWrite,
} from '../api';
import { createToolExecutor } from './tools';

export function useVoiceSession(onAssetFound: (id: string) => void) {
  const queryClient = useQueryClient();
  const [writePrompt, setWritePrompt] = useState<WritePrompt | null>(null);
  const [writeNotices, setWriteNotices] = useState<WriteNotice[]>([]);
  const writeConfirmation = useRef<SafetyConfirmation<WritePrompt> | null>(
    null,
  );
  const writeController = useRef<VoiceWrites | null>(null);
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
    const approveWrite = new SafetyConfirmation<WritePrompt>(setWritePrompt);
    writeConfirmation.current = approveWrite;
    const writes = new VoiceWrites({
      storage: {
        getItem: (key) => localStorage.getItem(key),
        setItem: (key, value) => localStorage.setItem(key, value),
      },
      uuid: () => crypto.randomUUID(),
      preview: previewVoiceWrite,
      submit: submitVoiceWrite,
      confirm: (prompt, signal) => approveWrite.request(prompt, signal),
      changed: (notice) =>
        setWriteNotices((items) =>
          [
            ...items.filter((item) => item.requestId !== notice.requestId),
            notice,
          ].slice(-20),
        ),
      saved: (assetId) => {
        void queryClient.invalidateQueries({ queryKey: ['assets'] });
        void queryClient.invalidateQueries({ queryKey: ['incidents'] });
        void queryClient.invalidateQueries({
          queryKey: ['maintenance', assetId],
        });
      },
    });
    writeController.current = writes;
    writes.restore();
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
        (name, args, signal) => writes.execute(name, args, signal),
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
      approveWrite.answer(false);
      writeConfirmation.current = null;
      writeController.current = null;
      confirmation.current = null;
      controller.current = null;
    };
  }, [onAssetFound, queryClient]);
  return {
    ...state,
    safetyPrompt,
    writePrompt,
    writeNotices,
    confirmWrite: (accepted: boolean) =>
      writeConfirmation.current?.answer(accepted),
    retryWrite: (requestId: string) =>
      void writeController.current?.retry(requestId),
    confirmSafety: (accepted: boolean) =>
      confirmation.current?.answer(accepted),
    connect: () => void controller.current?.connect(),
    end: () => controller.current?.end(),
    toggleMute: () => controller.current?.mute(),
  };
}
