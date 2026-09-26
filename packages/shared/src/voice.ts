import { z } from 'zod';

export const findAssetArgumentsSchema = z
  .object({
    query: z.string().trim().min(1).max(100),
  })
  .strict();

const faultCodeArgument = z.string().trim().min(1).max(40);
export const lookupFaultArgumentsSchema = z
  .object({
    asset_id: z
      .uuid()
      .describe('Asset UUID returned by find_asset, never an asset tag.'),
    fault_code: faultCodeArgument.describe(
      'Exact reported code, e.g. F0003. Preserve leading zeros.',
    ),
  })
  .strict();
export const historyArgumentsSchema = z
  .object({
    asset_id: z.uuid().describe('Asset UUID returned by find_asset.'),
    fault_code: faultCodeArgument.optional(),
    limit: z.number().int().min(1).max(10).optional(),
  })
  .strict();
export const faultResponseSchema = z.object({
  data: z.discriminatedUnion('found', [
    z.object({
      found: z.literal(false),
      assetId: z.uuid(),
      faultCode: z.string(),
      message: z.string(),
    }),
    z.object({
      found: z.literal(true),
      assetId: z.uuid(),
      faultCode: z.string(),
      title: z.string(),
      description: z.string(),
      manufacturer: z.string(),
      model: z.string(),
      source: z.string(),
      safetyLevel: z.string(),
      procedureKey: z.string().nullable(),
    }),
  ]),
});
export type FaultDefinition = z.infer<typeof faultResponseSchema>['data'];
export type HistoryArguments = z.infer<typeof historyArgumentsSchema>;

export const procedureArgumentsSchema = z
  .object({
    asset_id: z.uuid(),
    procedure_key: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[a-zA-Z0-9_-]+$/)
      .describe('Approved procedure key returned by lookup_fault_code.'),
  })
  .strict();
export const procedureResponseSchema = z.object({
  data: z.discriminatedUnion('found', [
    z.object({ found: z.literal(false), message: z.string() }),
    z.object({
      found: z.literal(true),
      assetId: z.uuid(),
      assetTag: z.string(),
      requiresSafetyConfirmation: z.boolean(),
      message: z.string(),
      procedure: z.object({
        key: z.string(),
        title: z.string(),
        source: z.string(),
        summary: z.string(),
        safetyLevel: z.string(),
        safetyConfirmationRequired: z.boolean(),
        steps: z.array(z.string()),
      }),
    }),
  ]),
});
export type ProcedureResult = z.infer<typeof procedureResponseSchema>['data'];
export type ProcedureRequest = z.infer<typeof procedureArgumentsSchema>;

export const voiceToolDefinitionSchema = z.object({
  type: z.literal('function'),
  name: z.enum([
    'find_asset',
    'lookup_fault_code',
    'get_maintenance_history',
    'get_approved_procedure',
  ]),
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
  {
    type: 'function' as const,
    name: 'lookup_fault_code' as const,
    description:
      'Retrieve a verified fault definition for the installed equipment. First use find_asset to obtain a unique asset UUID. Never guess fault meanings or remove leading zeros. If found is false, state that no verified definition is available. This does not retrieve procedure steps.',
    parameters: z.toJSONSchema(lookupFaultArgumentsSchema),
    execution_mode: 'interactive' as const,
    timeout_seconds: 15,
  },
  {
    type: 'function' as const,
    name: 'get_maintenance_history' as const,
    description:
      'Retrieve previous incidents, repair records and technician notes for a uniquely identified asset. First use find_asset to obtain its UUID. Filter by the reported fault_code when discussing repeat faults. History is evidence of past work, not an approved procedure or proof of the present root cause.',
    parameters: z.toJSONSchema(historyArgumentsSchema),
    execution_mode: 'interactive' as const,
    timeout_seconds: 15,
  },
  {
    type: 'function' as const,
    name: 'get_approved_procedure' as const,
    description:
      'Retrieve an approved procedure for the uniquely identified asset using the procedure key returned by lookup_fault_code. Safety-gated procedures wait for the technician to confirm in the workspace. Tell the technician to review the on-screen confirmation; do not claim safety is confirmed or invent steps while waiting. Read only returned approved steps, one at a time. Never supply safety confirmation arguments.',
    parameters: z.toJSONSchema(procedureArgumentsSchema),
    execution_mode: 'interactive' as const,
    timeout_seconds: 90,
  },
];
