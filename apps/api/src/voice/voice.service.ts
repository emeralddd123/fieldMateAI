import {
  Inject,
  Injectable,
  ServiceUnavailableException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { z } from 'zod';

export const VOICE_SETTINGS = Symbol('VOICE_SETTINGS');
export const VOICE_FETCH = Symbol('VOICE_FETCH');
export interface VoiceSettings {
  apiKey: string;
  voice: string;
  frontendOrigin: string;
}
const tokenSchema = z.object({ token: z.string().min(1) });

export const voicePrompt = [
  'You are FieldMate, a concise voice copilot for industrial maintenance technicians.',
  'Speak calmly and briefly, usually one or two sentences followed by one question.',
  'This session currently supports conversation only. Equipment lookup and maintenance actions are not connected to this voice session yet.',
  'Do not claim to know the selected asset, its faults, specifications, readings, approved procedures, or repair history.',
  'Do not claim to create, record, resolve, or escalate anything. Explain that the technician can use the maintenance workspace for those actions.',
  'Do not invent maintenance procedures or provide hazardous electrical or mechanical instructions.',
  'Never instruct the user to bypass site safety rules, guards, protective equipment, interlocks, or lockout requirements.',
  'If asked for troubleshooting instructions, explain that verified equipment knowledge must be connected first and recommend following site-approved procedures with qualified personnel.',
  'You may discuss the purpose of the product and help the technician clearly describe their issue. Be transparent about these limits.',
].join('\n');

@Injectable()
export class VoiceService {
  private readonly requests = new Map<string, number[]>();
  constructor(
    @Inject(VOICE_SETTINGS) private readonly settings: VoiceSettings,
    @Inject(VOICE_FETCH) private readonly request: typeof fetch,
  ) {}

  status() {
    return { enabled: Boolean(this.settings.apiKey) };
  }

  async mint(origin: string | undefined, ip: string) {
    if (origin && origin !== this.settings.frontendOrigin) {
      throw new ForbiddenException({
        code: 'VOICE_ORIGIN_REJECTED',
        message: 'Voice requests must come from the FieldMate workspace.',
      });
    }
    if (!this.settings.apiKey) {
      throw new ServiceUnavailableException({
        code: 'VOICE_NOT_CONFIGURED',
        message: 'Voice is not configured yet.',
      });
    }
    const now = Date.now();
    for (const [key, times] of this.requests)
      if (!times.some((time) => now - time < 60_000)) this.requests.delete(key);
    const times = (this.requests.get(ip) ?? []).filter(
      (time) => now - time < 60_000,
    );
    if (times.length >= 5 || this.requests.size >= 1000) {
      throw new HttpException(
        {
          code: 'VOICE_RATE_LIMITED',
          message:
            'Please wait a minute before starting another voice session.',
        },
        429,
      );
    }
    this.requests.set(ip, [...times, now]);
    const url = new URL('https://agents.assemblyai.com/v1/token');
    url.searchParams.set('expires_in_seconds', '60');
    url.searchParams.set('max_session_duration_seconds', '600');
    let token: string;
    try {
      const response = await this.request(url, {
        headers: { Authorization: `Bearer ${this.settings.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Token request failed');
      token = tokenSchema.parse(await response.json()).token;
    } catch {
      // Do not log or forward provider response bodies: they can contain credentials.
      throw new ServiceUnavailableException({
        code: 'VOICE_PROVIDER_UNAVAILABLE',
        message: 'Voice connection is unavailable. Please retry shortly.',
      });
    }
    return {
      token,
      expiresInSeconds: 60,
      maxSessionDurationSeconds: 600,
      sessionConfig: {
        system_prompt: voicePrompt,
        greeting:
          'Hi, I’m FieldMate. Voice conversation is ready. What would you like to discuss?',
        input: {
          format: { encoding: 'audio/pcm' as const },
          keyterms: [
            'FieldMate',
            'M-204',
            'F0003',
            'SINAMICS',
            'L1',
            'L2',
            'L3',
          ],
        },
        output: {
          voice: this.settings.voice,
          format: { encoding: 'audio/pcm' as const },
        },
        tools: [],
      },
    };
  }
}
