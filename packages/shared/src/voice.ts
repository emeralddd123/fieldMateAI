import {
  measurementArgumentsSchema,
  incidentArgumentsSchema,
  resolveIncidentArgumentsSchema,
  escalateIncidentArgumentsSchema,
  addIncidentNoteArgumentsSchema,
} from './writes';
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
    'record_measurement',
    'create_incident',
    'resolve_incident',
    'escalate_incident',
    'add_incident_note',
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
  {
    type: 'function' as const,
    name: 'record_measurement' as const,
    description:
      'Prepare a technician-reported voltage (line_voltage, V) or current (motor_current, A) reading for a known asset UUID. Use only values and units reported by the technician; ask when unclear. Optional incident_id must be a known incident UUID. The workspace displays the complete draft for confirmation before saving. Never claim success until the tool returns success with the saved ID. If cancelled, do not retry without a new user request.',
    parameters: z.toJSONSchema(measurementArgumentsSchema),
    execution_mode: 'interactive' as const,
    timeout_seconds: 90,
  },
  {
    type: 'function' as const,
    name: 'create_incident' as const,
    description:
      'Prepare a new incident for a known asset UUID with the reported symptom, priority and affected asset status. Link only measurement UUIDs returned from successful record_measurement calls for this asset. Confirm uncertain details with the technician. The workspace requires review before saving and changing asset status. Do not claim success until the tool returns the saved incident number. Unknown outcomes must be checked with the existing pending save, not a new incident.',
    parameters: z.toJSONSchema(incidentArgumentsSchema),
    execution_mode: 'interactive' as const,
    timeout_seconds: 90,
  },
  {
    type: 'function' as const,
    name: 'resolve_incident' as const,
    description:
      'Atomically resolve an active incident, record root cause and repair action taken, optionally capture a verification measurement (e.g. motor_current at 12.4 A), create a permanent maintenance record, and return equipment to operational status. Requires the active incident UUID and workspace review before saving. Do not claim success until the tool returns success.',
    parameters: z.toJSONSchema(resolveIncidentArgumentsSchema),
    execution_mode: 'interactive' as const,
    timeout_seconds: 90,
  },
  {
    type: 'function' as const,
    name: 'escalate_incident' as const,
    description:
      'Escalate an active incident to supervisor review when troubleshooting cannot proceed safely, parts are unavailable, or no approved procedure exists. Requires the active incident UUID and a specific reason. Requires workspace review before saving.',
    parameters: z.toJSONSchema(escalateIncidentArgumentsSchema),
    execution_mode: 'interactive' as const,
    timeout_seconds: 90,
  },
  {
    type: 'function' as const,
    name: 'add_incident_note' as const,
    description:
      'Add a field observation, measurement note, or diagnostic finding to an active incident. Requires the active incident UUID. Requires workspace review before saving.',
    parameters: z.toJSONSchema(addIncidentNoteArgumentsSchema),
    execution_mode: 'interactive' as const,
    timeout_seconds: 90,
  },
];
