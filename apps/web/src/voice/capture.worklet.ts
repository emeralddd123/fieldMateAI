import { PcmResampler } from './pcm';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  port: MessagePort;
}
declare function registerProcessor(
  name: string,
  processor: typeof AudioWorkletProcessor,
): void;

class CaptureProcessor extends AudioWorkletProcessor {
  private readonly resampler = new PcmResampler(sampleRate, (frame) => {
    this.port.postMessage(frame.buffer, [frame.buffer]);
  });
  process(inputs: Float32Array[][]) {
    const input = inputs[0]?.[0];
    if (input) this.resampler.push(input);
    return true;
  }
}
registerProcessor('fieldmate-capture', CaptureProcessor);
