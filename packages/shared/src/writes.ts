import { z } from 'zod';
const text = (max: number) => z.string().trim().min(1).max(max);
export const measurementArgumentsSchema = z
  .object({
    asset_id: z.uuid(),
    incident_id: z.uuid().optional(),
    measurement_type: z.enum(['line_voltage', 'motor_current']),
    value: z.number().min(0).max(999999999).multipleOf(0.000001),
    unit: z.enum(['V', 'A']),
    notes: text(2000).optional(),
  })
  .strict();
export const incidentArgumentsSchema = z
  .object({
    asset_id: z.uuid(),
    title: text(200),
    description: text(4000),
    fault_code: text(32).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    asset_status: z.enum(['down', 'warning', 'maintenance']),
    measurement_ids: z.array(z.uuid()).max(20).optional(),
  })
  .strict();
export const resolveIncidentArgumentsSchema = z
  .object({
    incident_id: z.uuid(),
    root_cause: text(4000),
    action_taken: text(4000),
    resolution_summary: text(4000),
    verification_measurement: z
      .object({
        measurement_type: z.enum(['line_voltage', 'motor_current']),
        value: z.number().min(0).max(999999999).multipleOf(0.000001),
        unit: z.enum(['V', 'A']),
        notes: text(2000).optional(),
      })
      .strict()
      .optional(),
    asset_status: z
      .enum(['operational', 'warning', 'maintenance', 'down'])
      .default('operational')
      .optional(),
  })
  .strict();

export const escalateIncidentArgumentsSchema = z
  .object({
    incident_id: z.uuid(),
    reason: text(4000),
    severity: z
      .enum(['supervisor_review', 'urgent'])
      .default('supervisor_review')
      .optional(),
  })
  .strict();

export const addIncidentNoteArgumentsSchema = z
  .object({
    incident_id: z.uuid(),
    note: text(4000),
  })
  .strict();

export const writeRequestSchema = z.discriminatedUnion('name', [
  z.object({
    name: z.literal('record_measurement'),
    args: measurementArgumentsSchema,
  }),
  z.object({
    name: z.literal('create_incident'),
    args: incidentArgumentsSchema,
  }),
  z.object({
    name: z.literal('resolve_incident'),
    args: resolveIncidentArgumentsSchema,
  }),
  z.object({
    name: z.literal('escalate_incident'),
    args: escalateIncidentArgumentsSchema,
  }),
  z.object({
    name: z.literal('add_incident_note'),
    args: addIncidentNoteArgumentsSchema,
  }),
]);
export type WriteRequest = z.infer<typeof writeRequestSchema>;
export const writeResultSchema = z.object({
  data: z.object({
    id: z.uuid(),
    assetId: z.uuid(),
    requestId: z.uuid(),
    source: z.literal('voice'),
    incidentNumber: z.string().optional(),
    status: z.string().optional(),
    measurementType: z.string().optional(),
    value: z.number().optional(),
    unit: z.string().optional(),
    rootCause: z.string().optional(),
    actionTaken: z.string().optional(),
    note: z.string().optional(),
    reason: z.string().optional(),
  }),
});
export type WriteResult = z.infer<typeof writeResultSchema>['data'];
