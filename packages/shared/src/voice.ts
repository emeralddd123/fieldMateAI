import { z } from 'zod';

export const findAssetArgumentsSchema = z
  .object({
    query: z.string().trim().min(1).max(100),
  })
  .strict();

export const voiceToolDefinitionSchema = z.object({
  type: z.literal('function'),
  name: z.literal('find_asset'),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()),
  execution_mode: z.literal('interactive'),
  timeout_seconds: z.number(),
});
export const voiceTools = [
  {
    type: 'function' as const,
    name: 'find_asset' as const,
    description:
      'Search the equipment register by asset tag, name, model or location. Call this whenever the technician identifies equipment or asks for its specifications. Use the spoken tag, e.g. M-204. A unique match selects that asset in the workspace. If several matches are returned, ask for the exact asset tag and search again; never choose arbitrarily.',
    parameters: z.toJSONSchema(findAssetArgumentsSchema),
    execution_mode: 'interactive' as const,
    timeout_seconds: 15,
  },
];
