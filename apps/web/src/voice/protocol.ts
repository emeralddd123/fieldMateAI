import { z } from 'zod';

export const voiceTokenSchema = z.object({
  data: z.object({
    token: z.string().min(1),
    expiresInSeconds: z.number(),
    maxSessionDurationSeconds: z.number(),
    sessionConfig: z.object({
      system_prompt: z.string(),
      greeting: z.string(),
      input: z.object({
        format: z.object({ encoding: z.literal('audio/pcm') }),
        keyterms: z.array(z.string()),
      }),
      output: z.object({
        voice: z.string(),
        format: z.object({ encoding: z.literal('audio/pcm') }),
      }),
      tools: z.array(z.never()),
    }),
  }),
});
export type VoiceCredential = z.infer<typeof voiceTokenSchema>['data'];
const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('session.ready'), session_id: z.string() }),
  z.object({ type: z.literal('session.ended') }),
  z.object({ type: z.literal('input.speech.started') }),
  z.object({ type: z.literal('input.speech.stopped') }),
  z.object({ type: z.literal('reply.started'), reply_id: z.string() }),
  z.object({ type: z.literal('reply.audio'), data: z.string() }),
  z.object({
    type: z.literal('reply.done'),
    reply_id: z.string(),
    status: z.enum(['completed', 'interrupted']),
  }),
  z.object({
    type: z.enum(['transcript.user.delta', 'transcript.user']),
    item_id: z.string(),
    text: z.string(),
  }),
  z.object({
    type: z.literal('transcript.agent.delta'),
    item_id: z.string(),
    reply_id: z.string(),
    delta: z.string(),
  }),
  z.object({
    type: z.literal('transcript.agent'),
    item_id: z.string(),
    reply_id: z.string(),
    text: z.string(),
    interrupted: z.boolean().optional(),
  }),
  z.object({
    type: z.enum(['session.error', 'error']),
    code: z.string().optional(),
    message: z.string().optional(),
  }),
  z.object({ type: z.literal('tool.call') }),
]);
export type VoiceEvent = z.infer<typeof eventSchema>;
export function parseEvent(data: unknown): VoiceEvent | null {
  if (typeof data !== 'string' || data.length > 2_000_000)
    throw new Error('Invalid voice message');
  const result = eventSchema.safeParse(JSON.parse(data));
  return result.success ? result.data : null;
}
export interface TranscriptItem {
  id: string;
  speaker: 'user' | 'agent';
  text: string;
  final: boolean;
  interrupted?: boolean;
}
export function updateTranscript(
  items: TranscriptItem[],
  event: VoiceEvent,
): TranscriptItem[] {
  if (!('item_id' in event)) return items;
  const speaker = event.type.startsWith('transcript.user') ? 'user' : 'agent';
  const id = `${speaker}:${'reply_id' in event ? event.reply_id : event.item_id}`;
  const previous = items.find((item) => item.id === id);
  if (previous?.final && event.type.endsWith('.delta')) return items;
  const text =
    event.type === 'transcript.agent.delta'
      ? `${previous?.text ?? ''}${previous?.text && !/^[\s.,!?;:]/.test(event.delta) ? ' ' : ''}${event.delta}`
      : 'text' in event
        ? event.text
        : '';
  const item: TranscriptItem = {
    id,
    speaker,
    text,
    final: !event.type.endsWith('.delta'),
    interrupted: 'interrupted' in event ? event.interrupted : undefined,
  };
  return (
    previous
      ? items.map((existing) => (existing.id === id ? item : existing))
      : [...items, item]
  ).slice(-200);
}
