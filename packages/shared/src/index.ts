import { z } from 'zod';

export const assetStatusSchema = z.enum([
  'operational',
  'warning',
  'down',
  'maintenance',
]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const assetSchema = z.object({
  id: z.uuid(),
  assetTag: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  equipmentType: z.string(),
  manufacturer: z.string(),
  model: z.string(),
  location: z.string(),
  status: assetStatusSchema,
  nominalVoltageV: z.number().nullable(),
  nominalCurrentA: z.number().nullable(),
  site: z.object({ name: z.string(), code: z.string() }),
  components: z.array(
    z.object({
      id: z.uuid(),
      componentType: z.string(),
      manufacturer: z.string(),
      model: z.string(),
    }),
  ),
});

export type Asset = z.infer<typeof assetSchema>;
export const assetsResponseSchema = z.object({ data: z.array(assetSchema) });
export interface ApiError {
  error: { code: string; message: string };
}

const measurementSchema = z.object({
  id: z.uuid(),
  measurementType: z.string(),
  value: z.number(),
  unit: z.string(),
  notes: z.string().nullable(),
  recordedAt: z.string(),
});
const maintenanceRecordSchema = z.object({
  id: z.uuid(),
  faultCode: z.string().nullable(),
  symptom: z.string(),
  rootCause: z.string(),
  actionTaken: z.string(),
  verification: z.string(),
  performedAt: z.string(),
  technician: z.object({ name: z.string() }).nullable(),
});
export const maintenanceHistorySchema = z.object({
  data: z.object({
    assetId: z.uuid(),
    assetTag: z.string(),
    totalMatchingIncidents: z.number().int(),
    incidents: z.array(
      z.object({
        id: z.uuid(),
        incidentNumber: z.string(),
        title: z.string(),
        description: z.string(),
        faultCode: z.string().nullable(),
        status: z.enum([
          'open',
          'investigating',
          'escalated',
          'resolved',
          'closed',
        ]),
        priority: z.enum(['low', 'medium', 'high', 'critical']),
        openedAt: z.string(),
        notes: z.array(z.object({ id: z.uuid(), note: z.string() })),
      }),
    ),
    maintenanceRecords: z.array(maintenanceRecordSchema),
  }),
});
export const measurementsResponseSchema = z.object({
  data: z.array(measurementSchema),
});
export type MaintenanceHistory = z.infer<
  typeof maintenanceHistorySchema
>['data'];

export {
  procedureArgumentsSchema,
  procedureResponseSchema,
  lookupFaultArgumentsSchema,
  historyArgumentsSchema,
  faultResponseSchema,
  findAssetArgumentsSchema,
  voiceToolDefinitionSchema,
  voiceTools,
} from './voice';

export type { FaultDefinition, HistoryArguments } from './voice';

export type { ProcedureResult, ProcedureRequest } from './voice';

export {
  measurementArgumentsSchema,
  incidentArgumentsSchema,
  resolveIncidentArgumentsSchema,
  escalateIncidentArgumentsSchema,
  addIncidentNoteArgumentsSchema,
  writeRequestSchema,
  writeResultSchema,
} from './writes';
export type { WriteRequest, WriteResult } from './writes';
