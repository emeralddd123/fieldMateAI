import { VoiceToolQueue } from './tools';
import type { ExecuteTool, ToolActivity } from './tools';
import { encodePcm } from './pcm';
import { parseEvent, updateTranscript } from './protocol';
import type { TranscriptItem, VoiceCredential } from './protocol';
import type { VoiceAudio } from './audio';

export type VoiceStatus =
  | 'disconnected'
  | 'connecting'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'ending'
  | 'error';
export interface VoiceSnapshot {
  status: VoiceStatus;
  muted: boolean;
  error: string | null;
  sessionId: string | null;
  transcript: TranscriptItem[];
  tools: ToolActivity[];
}
export interface VoiceDependencies {
  executeTool?: ExecuteTool;
  assetFound?: (id: string) => void;
  token(signal: AbortSignal): Promise<VoiceCredential>;
  socket(url: string): WebSocket;
  audio(onPlayback: (active: boolean) => void): VoiceAudio;
}
const initial = (): VoiceSnapshot => ({
  status: 'disconnected',
  muted: false,
  error: null,
  sessionId: null,
  transcript: [],
  tools: [],
});

export class VoiceSession {
  snapshot = initial();
  private socket?: WebSocket;
  private tools?: VoiceToolQueue;
  private audio?: VoiceAudio;
  private abort?: AbortController;
  private timeout?: ReturnType<typeof setTimeout>;
  private epoch = 0;
  private ready = false;
  private ending = false;
  private endSent = false;
  private playback = false;
  private thinking = false;
  private userSpeaking = false;
  private acceptingAudio = false;
  private activeReply: string | null = null;

  constructor(
    private readonly changed: (state: VoiceSnapshot) => void,
    private readonly deps: VoiceDependencies,
  ) {}
  private emit(patch: Partial<VoiceSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.changed(this.snapshot);
  }
  private refreshStatus() {
    if (!this.ready || this.ending) return;
    this.emit({
      status: this.userSpeaking
        ? 'listening'
        : this.playback
          ? 'speaking'
          : this.thinking
            ? 'thinking'
            : 'listening',
    });
  }
  async connect() {
    if (!['disconnected', 'error'].includes(this.snapshot.status)) return;
    this.dispose();
    const epoch = this.epoch;
    this.endSent = false;
    this.ending = false;
    this.abort = new AbortController();
    this.snapshot = initial();
    this.emit({ status: 'connecting' });
    try {
      this.audio = this.deps.audio((active) => {
        if (epoch !== this.epoch) return;
        this.playback = active;
        this.refreshStatus();
      });
      await this.audio.start((frame) => {
        if (
          epoch !== this.epoch ||
          !this.ready ||
          this.ending ||
          this.socket?.readyState !== 1
        )
          return;
        if (this.socket.bufferedAmount > 128_000) {
          this.fail('The voice connection is too slow. Please reconnect.');
          return;
        }
        try {
          // Continue silent frames while muted so turn detection can finish the preceding utterance.
          this.socket.send(
            JSON.stringify({
              type: 'input.audio',
              audio: encodePcm(
                this.snapshot.muted ? new Uint8Array(frame.length) : frame,
              ),
            }),
          );
        } catch {
          this.fail('The voice connection was lost. Please reconnect.');
        }
      });
      if (epoch !== this.epoch) return;
      const credential = await this.deps.token(this.abort.signal);
      if (epoch !== this.epoch) return;
      const url = new URL('wss://agents.assemblyai.com/v1/ws');
      url.searchParams.set('token', credential.token);
      this.tools = new VoiceToolQueue(
        this.deps.executeTool ??
          (async () => ({
            result: { error: 'Tool unavailable' },
            isError: true,
            summary: 'Action unavailable.',
          })),
        (event) => {
          if (
            epoch !== this.epoch ||
            this.ending ||
            !this.ready ||
            this.socket?.readyState !== 1
          )
            throw new Error('Session ended');
          this.socket.send(JSON.stringify(event));
        },
        (activity, assetId) => {
          if (epoch !== this.epoch) return;
          const existing = this.snapshot.tools.some(
            (item) => item.id === activity.id,
          );
          this.emit({
            tools: (existing
              ? this.snapshot.tools.map((item) =>
                  item.id === activity.id ? activity : item,
                )
              : [...this.snapshot.tools, activity]
            ).slice(-50),
          });
          if (assetId) this.deps.assetFound?.(assetId);
        },
      );
      const socket = this.deps.socket(url.href);
      this.socket = socket;
      this.timeout = setTimeout(
        () => this.fail('Voice did not become ready. Please retry.'),
        15_000,
      );
      socket.onopen = () => {
        if (epoch !== this.epoch) return;
        socket.send(
          JSON.stringify({
            type: 'session.update',
            session: credential.sessionConfig,
          }),
        );
      };
      socket.onmessage = (message) => {
        if (epoch !== this.epoch) return;
        try {
          const event = parseEvent(message.data);
          if (!event) return;
          if (event.type === 'session.ended') {
            this.endSent = true;
            this.finish();
            return;
          }
          if (this.ending) return;
          if (event.type === 'session.ready') {
            clearTimeout(this.timeout);
            this.ready = true;
            this.emit({ sessionId: event.session_id });
            this.refreshStatus();
          } else if (event.type === 'input.speech.started') {
            this.tools?.busy();
            this.userSpeaking = true;
            this.thinking = false;
            this.refreshStatus();
          } else if (event.type === 'input.speech.stopped') {
            this.userSpeaking = false;
            this.thinking = true;
            this.refreshStatus();
          } else if (event.type === 'reply.started') {
            this.tools?.busy();
            this.activeReply = event.reply_id;
            this.acceptingAudio = true;
            this.thinking = true;
            this.refreshStatus();
          } else if (event.type === 'reply.audio') {
            if (this.acceptingAudio) this.audio?.play(event.data);
          } else if (event.type === 'reply.done') {
            this.tools?.done(event.status === 'interrupted');
            if (this.activeReply !== event.reply_id) return;
            this.acceptingAudio = false;
            this.thinking = false;
            if (event.status === 'interrupted') this.audio?.clear();
            this.refreshStatus();
          } else if (event.type.startsWith('transcript.')) {
            this.emit({
              transcript: updateTranscript(this.snapshot.transcript, event),
            });
          } else if (event.type === 'session.error' || event.type === 'error') {
            this.fail(
              'The voice provider could not continue this session. Please retry.',
            );
          } else if (event.type === 'tool.call') {
            if (this.ready)
              this.tools?.call(event.call_id, event.name, event.arguments);
          }
        } catch {
          this.fail('Voice received an invalid response. Please reconnect.');
        }
      };
      socket.onerror = () => {
        if (epoch === this.epoch && !this.ending)
          this.fail(
            'Voice could not connect. Check your connection and retry.',
          );
      };
      socket.onclose = () => {
        if (epoch !== this.epoch) return;
        if (this.ending) this.finish();
        else
          this.fail(
            'The voice connection ended unexpectedly. Start a new session to continue.',
          );
      };
    } catch (error) {
      if (epoch !== this.epoch) return;
      const name = error instanceof Error ? error.name : '';
      this.fail(
        name === 'NotAllowedError'
          ? 'Microphone access was denied. Allow microphone access in your browser and retry.'
          : name === 'NotFoundError'
            ? 'No microphone was found. Connect a microphone and retry.'
            : error instanceof Error
              ? error.message
              : 'Voice is unavailable. Please retry.',
      );
    }
  }
  mute() {
    if (!this.ready || this.ending) return;
    const muted = !this.snapshot.muted;
    this.audio?.mute(muted);
    this.emit({ muted });
  }
  end() {
    if (this.ending || ['disconnected', 'error'].includes(this.snapshot.status))
      return;
    this.ending = true;
    this.emit({ status: 'ending' });
    this.abort?.abort();
    this.tools?.cancel();
    this.ready = false;
    this.audio?.close();
    clearTimeout(this.timeout);
    if (this.socket?.readyState === 1) {
      try {
        this.socket.send(JSON.stringify({ type: 'session.end' }));
        this.endSent = true;
        this.timeout = setTimeout(() => this.finish(), 2000);
      } catch {
        this.finish();
      }
    } else this.finish();
  }
  private fail(message: string) {
    this.dispose();
    this.emit({ status: 'error', muted: false, error: message });
  }
  private finish() {
    this.dispose();
    this.emit({ status: 'disconnected', muted: false });
  }
  dispose() {
    this.tools?.cancel();
    this.tools = undefined;
    this.epoch++;
    this.ready = false;
    this.ending = false;
    this.acceptingAudio = false;
    this.activeReply = null;
    this.playback = false;
    this.thinking = false;
    this.userSpeaking = false;
    clearTimeout(this.timeout);
    this.abort?.abort();
    this.audio?.close();
    this.audio = undefined;
    if (this.socket) {
      const socket = this.socket;
      socket.onmessage = socket.onopen = socket.onerror = socket.onclose = null;
      try {
        if (socket.readyState === 1 && !this.endSent)
          socket.send(JSON.stringify({ type: 'session.end' }));
      } catch {
        /* Socket already lost. */
      }
      socket.close();
      this.socket = undefined;
    }
  }
}
