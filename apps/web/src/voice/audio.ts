import captureUrl from './capture.worklet.ts?worker&url';
import { PlaybackQueue } from './playback';

export interface VoiceAudio {
  start(onFrame: (frame: Uint8Array) => void): Promise<void>;
  play(data: string): void;
  clear(): void;
  mute(value: boolean): void;
  close(): void;
}
export class BrowserVoiceAudio implements VoiceAudio {
  private readonly context: AudioContext;
  private readonly playback: PlaybackQueue;
  private stream?: MediaStream;
  private source?: MediaStreamAudioSourceNode;
  private worklet?: AudioWorkletNode;
  private gain?: GainNode;
  private closed = false;

  constructor(onPlayback: (active: boolean) => void) {
    // Construct/resume synchronously in the click handler for Safari autoplay rules.
    this.context = new AudioContext();
    this.playback = new PlaybackQueue(this.context, onPlayback);
  }
  async start(onFrame: (frame: Uint8Array) => void) {
    try {
      const resumed = this.context.resume();
      // Attach immediately while the permission prompt may still be pending.
      void resumed.catch(() => {});
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          channelCount: 1,
        },
      });
      if (this.closed) {
        stream.getTracks().forEach((track) => track.stop());
        throw new DOMException('Cancelled', 'AbortError');
      }
      this.stream = stream;
      await resumed;
      await this.context.audioWorklet.addModule(captureUrl);
      if (this.closed) throw new DOMException('Cancelled', 'AbortError');
      this.source = this.context.createMediaStreamSource(stream);
      this.worklet = new AudioWorkletNode(this.context, 'fieldmate-capture');
      this.worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (!this.closed) onFrame(new Uint8Array(event.data));
      };
      // Keep capture processing alive without feeding the microphone into the speakers.
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.source
        .connect(this.worklet)
        .connect(this.gain)
        .connect(this.context.destination);
    } catch (error) {
      this.close();
      throw error;
    }
  }
  play(data: string) {
    if (!this.closed) this.playback.enqueue(data);
  }
  clear() {
    this.playback.clear();
  }
  mute(value: boolean) {
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !value;
    });
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.playback.clear();
    this.stream?.getTracks().forEach((track) => track.stop());
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.port.close();
      this.worklet.disconnect();
    }
    this.source?.disconnect();
    this.gain?.disconnect();
    void this.context.close().catch(() => {});
  }
}
