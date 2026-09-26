import { decodePcm, PCM_RATE } from './pcm';

export class PlaybackQueue {
  private readonly sources = new Set<AudioBufferSourceNode>();
  private nextTime = 0;
  constructor(
    private readonly context: AudioContext,
    private readonly changed: (active: boolean) => void,
  ) {}
  get active() {
    return this.sources.size > 0;
  }
  enqueue(data: string) {
    const samples = decodePcm(data);
    if (!samples.length) return;
    if (this.nextTime - this.context.currentTime > 15)
      throw new Error('Audio playback is falling behind. Please reconnect.');
    const buffer = this.context.createBuffer(1, samples.length, PCM_RATE);
    buffer.getChannelData(0).set(samples);
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.context.destination);
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      if (!this.sources.size) this.changed(false);
    };
    this.sources.add(source);
    const startAt = Math.max(this.context.currentTime, this.nextTime);
    this.nextTime = startAt + buffer.duration;
    source.start(startAt);
    this.changed(true);
  }
  clear() {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* Already ended. */
      }
      source.disconnect();
    }
    this.sources.clear();
    this.nextTime = this.context.currentTime;
    this.changed(false);
  }
}
