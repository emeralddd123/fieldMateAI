export const PCM_RATE = 24_000;
export const FRAME_SAMPLES = 480;

// Carry fractional phase across render blocks; rounding each 128-sample block drifts at 44.1 kHz.
export class PcmResampler {
  private position = 0;
  private index = 0;
  private previous = 0;
  private frame = new Uint8Array(FRAME_SAMPLES * 2);
  private filled = 0;
  constructor(
    private readonly inputRate: number,
    private readonly emit: (frame: Uint8Array) => void,
  ) {
    if (!Number.isFinite(inputRate) || inputRate <= 0)
      throw new Error('Invalid sample rate');
  }
  push(input: Float32Array) {
    for (const sample of input) {
      if (this.index > 0) {
        while (this.position <= this.index) {
          const fraction = this.position - (this.index - 1);
          const value = Math.max(
            -1,
            Math.min(1, this.previous + (sample - this.previous) * fraction),
          );
          new DataView(this.frame.buffer).setInt16(
            this.filled * 2,
            Math.round(value * (value < 0 ? 32768 : 32767)),
            true,
          );
          this.filled++;
          if (this.filled === FRAME_SAMPLES) {
            this.emit(this.frame);
            this.frame = new Uint8Array(FRAME_SAMPLES * 2);
            this.filled = 0;
          }
          this.position += this.inputRate / PCM_RATE;
        }
      }
      this.previous = sample;
      this.index++;
    }
  }
}
export function encodePcm(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}
export function decodePcm(base64: string): Float32Array {
  const raw = atob(base64);
  if (raw.length % 2 !== 0 || raw.length > 1_048_576)
    throw new Error('Invalid audio chunk');
  const bytes = Uint8Array.from(raw, (value) => value.charCodeAt(0));
  const view = new DataView(bytes.buffer);
  return Float32Array.from(
    { length: bytes.length / 2 },
    (_, index) => view.getInt16(index * 2, true) / 32768,
  );
}
