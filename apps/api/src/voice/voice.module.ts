import { Module } from '@nestjs/common';
import { env } from '../config/env';
import { VoiceController } from './voice.controller';
import { VoiceService, VOICE_FETCH, VOICE_SETTINGS } from './voice.service';

@Module({
  controllers: [VoiceController],
  providers: [
    VoiceService,
    { provide: VOICE_FETCH, useValue: fetch },
    {
      provide: VOICE_SETTINGS,
      useValue: {
        apiKey: env.ASSEMBLYAI_API_KEY,
        voice: env.ASSEMBLYAI_VOICE,
        frontendOrigin: new URL(env.FRONTEND_URL).origin,
      },
    },
  ],
})
export class VoiceModule {}
