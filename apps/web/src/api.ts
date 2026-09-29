import { z } from 'zod';
import { WriteRejected } from './voice/writes';
import type { HistoryArguments } from '@fieldmate/shared';
import { LookupError } from './voice/tools';
import {
  assetSchema,
  writeResultSchema,
  assetsResponseSchema,
  faultResponseSchema,
  procedureResponseSchema,
  maintenanceHistorySchema,
  measurementsResponseSchema,
} from '@fieldmate/shared';
import { voiceTokenSchema } from './voice/protocol';

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(
  /\/$/,
  '',
);

function apiFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: 'include',
  });
}

export async function fetchVoiceToken(signal: AbortSignal) {
  const response = await apiFetch(`${baseUrl}/voice/token`, {
    method: 'POST',
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    cache: 'no-store',
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    const code = result?.error?.code;
    throw new Error(
      code === 'VOICE_NOT_CONFIGURED'
        ? 'Voice is not configured yet. Please contact the workspace administrator.'
        : code === 'VOICE_RATE_LIMITED'
          ? 'Please wait a minute before starting another voice session.'
          : 'Voice connection is unavailable. Please retry shortly.',
    );
  }
  return voiceTokenSchema.parse(await response.json()).data;
}

export async function fetchAssets() {
  const response = await apiFetch(`${baseUrl}/assets`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(
      'Equipment data is unavailable. Check the connection and try again.',
    );
  return assetsResponseSchema.parse(await response.json()).data;
}

export async function fetchMaintenance(assetId: string) {
  const responses = await Promise.all([
    apiFetch(`${baseUrl}/assets/${assetId}/history?limit=10`, {
      signal: AbortSignal.timeout(10_000),
    }),
    apiFetch(`${baseUrl}/assets/${assetId}/measurements?limit=6`, {
      signal: AbortSignal.timeout(10_000),
    }),
  ]);
  if (responses.some((response) => !response.ok))
    throw new Error('Maintenance records are unavailable. Please retry.');
  const [history, measurements] = await Promise.all(
    responses.map((response) => response.json()),
  );
  return {
    history: maintenanceHistorySchema.parse(history).data,
    measurements: measurementsResponseSchema.parse(measurements).data,
  };
}

export async function searchVoiceAssets(query: string, signal: AbortSignal) {
  const response = await apiFetch(
    `${baseUrl}/assets/search?q=${encodeURIComponent(query)}`,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
      cache: 'no-store',
    },
  );
  if (!response.ok) throw new Error('Equipment search unavailable');
  return assetsResponseSchema.parse(await response.json()).data;
}

async function fetchVoiceKnowledge(path: string, signal: AbortSignal) {
  const response = await apiFetch(`${baseUrl}${path}`, {
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    cache: 'no-store',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const code = body?.error?.code;
    throw new LookupError(
      code === 'ASSET_NOT_FOUND' || code === 'AMBIGUOUS_FAULT'
        ? code
        : 'UNAVAILABLE',
    );
  }
  return response.json();
}
export async function fetchVoiceFault(
  assetId: string,
  code: string,
  signal: AbortSignal,
) {
  return faultResponseSchema.parse(
    await fetchVoiceKnowledge(
      `/assets/${encodeURIComponent(assetId)}/faults/${encodeURIComponent(code)}`,
      signal,
    ),
  ).data;
}
export async function fetchVoiceHistory(
  args: HistoryArguments,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({ limit: String(args.limit ?? 5) });
  if (args.fault_code) query.set('faultCode', args.fault_code);
  return maintenanceHistorySchema.parse(
    await fetchVoiceKnowledge(
      `/assets/${encodeURIComponent(args.asset_id)}/history?${query}`,
      signal,
    ),
  ).data;
}

export async function fetchVoiceProcedure(
  args: import('@fieldmate/shared').ProcedureRequest,
  confirmed: boolean,
  signal: AbortSignal,
) {
  const query = new URLSearchParams({ assetId: args.asset_id });
  if (confirmed) query.set('safeStateConfirmed', 'true');
  return procedureResponseSchema.parse(
    await fetchVoiceKnowledge(
      `/procedures/${encodeURIComponent(args.procedure_key)}?${query}`,
      signal,
    ),
  ).data;
}

async function describeIncidentFault(
  assetId: string,
  code: string | undefined | null,
  signal: AbortSignal,
) {
  if (!code) return 'Fault: Not specified';
  try {
    const fault = await fetchVoiceFault(assetId, code, signal);
    return fault.found
      ? `Fault: ${fault.faultCode} · verified ${fault.title} (${fault.source})`
      : `Fault: ${fault.faultCode} · unverified for this equipment; save and escalation retain it only as reported.`;
  } catch {
    return `Fault: ${code} · verification unavailable; save and escalation retain it only as reported.`;
  }
}

export async function previewVoiceWrite(
  request: import('@fieldmate/shared').WriteRequest,
  signal: AbortSignal,
): Promise<import('./voice/writes').WritePrompt> {
  let assetId = 'asset_id' in request.args ? request.args.asset_id : '';
  let incidentData: {
    id: string;
    incidentNumber: string;
    title: string;
    status: string;
    assetId: string;
    faultCode: string | null;
  } | null = null;
  if ('incident_id' in request.args && request.args.incident_id) {
    const incRes = await fetchVoiceKnowledge(
      `/incidents/${request.args.incident_id}`,
      signal,
    );
    incidentData = incRes.data;
    if (!assetId && incidentData) assetId = incidentData.assetId;
  }
  const asset = assetSchema.parse(
    (await fetchVoiceKnowledge(`/assets/${assetId}`, signal)).data,
  );
  const details = [`Equipment: ${asset.assetTag} · ${asset.name}`];
  if (request.name === 'record_measurement') {
    details.push(
      `Reading: ${request.args.value} ${request.args.unit} (${request.args.measurement_type})`,
    );
    if (request.args.notes) details.push(`Notes: ${request.args.notes}`);
    if (request.args.incident_id) {
      if (
        !incidentData ||
        incidentData.assetId !== asset.id ||
        !['open', 'investigating', 'escalated'].includes(incidentData.status)
      )
        throw new WriteRejected(
          'The incident must be active and belong to this asset. Nothing was submitted.',
        );
      details.push(`Attach to incident: ${incidentData.incidentNumber}`);
    } else details.push('Save as an unassigned reading on this asset.');
    return { title: 'Review measurement', details };
  } else if (request.name === 'create_incident') {
    const draft = request.args;
    let titleToDisplay = draft.title?.trim() || '';
    if (!titleToDisplay || ['new incident', 'incident'].includes(titleToDisplay.toLowerCase())) {
      titleToDisplay = draft.fault_code ? `${draft.fault_code} Anomaly` : `${asset.name} Anomaly`;
    }
    details.push(
      `Title: ${titleToDisplay}`,
      `Description: ${draft.description}`,
      await describeIncidentFault(asset.id, draft.fault_code, signal),
      `Priority: ${draft.priority}`,
      `Equipment status: ${asset.status === 'down' ? 'down (retained)' : draft.asset_status}`,
    );
    if (draft.measurement_ids?.length) {
      const readings = await fetchVoiceKnowledge(
        `/assets/${request.args.asset_id}/measurements?limit=100`,
        signal,
      );
      const validated = z
        .array(
          z.object({
            id: z.uuid(),
            assetId: z.uuid(),
            incidentId: z.uuid().nullable(),
            value: z.number(),
            unit: z.string(),
            measurementType: z.string(),
          }),
        )
        .parse(readings.data);
      for (const id of draft.measurement_ids) {
        const reading = validated.find(
          (item) =>
            item.id === id &&
            item.assetId === asset.id &&
            item.incidentId === null,
        );
        if (!reading)
          throw new WriteRejected(
            'A linked reading is unavailable, already assigned, or belongs to another asset. Review the reading IDs; nothing was submitted.',
          );
        details.push(
          `Link reading: ${reading.value} ${reading.unit} (${reading.measurementType}) · ${id}`,
        );
      }
    } else details.push('No existing readings will be linked.');
    return { title: 'Review new incident', details };
  } else if (request.name === 'resolve_incident') {
    if (
      !incidentData ||
      !['open', 'investigating', 'escalated'].includes(incidentData.status)
    )
      throw new WriteRejected(
        'The incident is no longer active. Nothing was submitted.',
      );
    details.push(
      `Incident: ${incidentData.incidentNumber} · ${incidentData.title}`,
      `Root cause: ${request.args.root_cause}`,
      `Action taken: ${request.args.action_taken}`,
      `Verification: ${request.args.resolution_summary}`,
    );
    if (request.args.verification_measurement) {
      const m = request.args.verification_measurement;
      details.push(
        `Verification reading: ${m.value} ${m.unit} (${m.measurement_type})`,
      );
    }
    details.push(
      `Equipment status: ${request.args.asset_status ?? 'operational'}`,
    );
    return { title: 'Review repair resolution', details };
  } else if (request.name === 'escalate_incident') {
    if (
      !incidentData ||
      !['open', 'investigating', 'escalated'].includes(incidentData.status)
    )
      throw new WriteRejected(
        'The incident is no longer active. Nothing was submitted.',
      );
    details.push(
      `Incident: ${incidentData.incidentNumber} · ${incidentData.title}`,
      await describeIncidentFault(
        incidentData.assetId,
        incidentData.faultCode,
        signal,
      ),
      `Reason: ${request.args.reason}`,
      `Severity: ${request.args.severity ?? 'supervisor_review'}`,
    );
    return { title: 'Review incident escalation', details };
  } else if (request.name === 'add_incident_note') {
    if (
      !incidentData ||
      !['open', 'investigating', 'escalated'].includes(incidentData.status)
    )
      throw new WriteRejected(
        'The incident is no longer active. Nothing was submitted.',
      );
    details.push(
      `Incident: ${incidentData.incidentNumber} · ${incidentData.title}`,
      `Note: ${request.args.note}`,
    );
    return { title: 'Review incident note', details };
  }
  throw new Error('Unknown write request');
}

async function handleWriteError(response: Response): Promise<never> {
  if ([400, 404, 409].includes(response.status)) {
    const data = await response.json().catch(() => null);
    const messages: Record<string, string> = {
      REQUEST_ID_REUSED:
        'This save ID belongs to different data. Check the existing record before creating a new request.',
      INVALID_MEASUREMENT_LINK:
        'Readings must belong to this asset and be unassigned. Nothing was saved.',
      ASSET_MISMATCH:
        'The incident belongs to another asset. Nothing was saved.',
      INCIDENT_FINISHED: 'The incident is no longer active. Nothing was saved.',
    };
    throw new WriteRejected(
      messages[data?.error?.code] ??
        'The server rejected this request. Review the asset, incident and reading details. Nothing new was saved.',
    );
  }
  throw new Error('Save outcome unknown');
}

export async function submitVoiceWrite(
  request: import('@fieldmate/shared').WriteRequest,
  requestId: string,
) {
  if (request.name === 'record_measurement') {
    const body = {
      assetId: request.args.asset_id,
      incidentId: request.args.incident_id,
      measurementType: request.args.measurement_type,
      value: request.args.value,
      unit: request.args.unit,
      notes: request.args.notes,
      requestId,
      source: 'voice',
    };
    const response = await apiFetch(`${baseUrl}/measurements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) await handleWriteError(response);
    const data = writeResultSchema.parse(await response.json()).data;
    if (
      data.value !== request.args.value ||
      data.unit !== request.args.unit ||
      data.measurementType !== request.args.measurement_type
    )
      throw new Error('Unexpected saved reading');
    return data;
  }
  if (request.name === 'create_incident') {
    let finalTitle = request.args.title?.trim() || '';
    if (!finalTitle || ['new incident', 'incident'].includes(finalTitle.toLowerCase())) {
      finalTitle = request.args.fault_code ? `${request.args.fault_code} Anomaly` : 'Equipment Anomaly';
    }
    const body = {
      assetId: request.args.asset_id,
      title: finalTitle,
      description: request.args.description,
      faultCode: request.args.fault_code,
      priority: request.args.priority,
      assetStatus: request.args.asset_status,
      measurementIds: request.args.measurement_ids,
      requestId,
      source: 'voice',
    };
    const response = await apiFetch(`${baseUrl}/incidents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) await handleWriteError(response);
    const data = writeResultSchema.parse(await response.json()).data;
    if (!data.incidentNumber) throw new Error('Missing incident number');
    return data;
  }
  if (request.name === 'resolve_incident') {
    const incRes = await fetchVoiceKnowledge(
      `/incidents/${request.args.incident_id}`,
      AbortSignal.timeout(10_000),
    );
    const body = {
      assetId: incRes.data.assetId,
      rootCause: request.args.root_cause,
      actionTaken: request.args.action_taken,
      verificationSummary: request.args.resolution_summary,
      verificationMeasurement: request.args.verification_measurement
        ? {
            measurementType:
              request.args.verification_measurement.measurement_type,
            value: request.args.verification_measurement.value,
            unit: request.args.verification_measurement.unit,
            notes: request.args.verification_measurement.notes,
          }
        : undefined,
      assetStatus: request.args.asset_status ?? 'operational',
      source: 'voice',
    };
    const response = await apiFetch(
      `${baseUrl}/incidents/${request.args.incident_id}/complete-repair`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) await handleWriteError(response);
    const json = await response.json();
    const result = json.data;
    return {
      id: result.maintenanceRecord.id,
      assetId: result.asset.id,
      requestId,
      source: 'voice' as const,
      incidentNumber: result.incident.incidentNumber,
      status: result.asset.status,
      rootCause: result.incident.rootCause,
      actionTaken: result.incident.actionTaken,
    };
  }
  if (request.name === 'escalate_incident') {
    const body = {
      reason: request.args.reason,
      severity: request.args.severity ?? 'supervisor_review',
    };
    const response = await apiFetch(
      `${baseUrl}/incidents/${request.args.incident_id}/escalate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) await handleWriteError(response);
    const json = await response.json();
    const inc = await fetchVoiceKnowledge(
      `/incidents/${request.args.incident_id}`,
      AbortSignal.timeout(10_000),
    );
    return {
      id: json.data.id,
      assetId: inc.data.assetId,
      requestId,
      source: 'voice' as const,
      incidentNumber: inc.data.incidentNumber,
      status: inc.data.status,
      reason: request.args.reason,
    };
  }
  if (request.name === 'add_incident_note') {
    const body = {
      note: request.args.note,
      source: 'voice',
      requestId,
    };
    const response = await apiFetch(
      `${baseUrl}/incidents/${request.args.incident_id}/notes`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) await handleWriteError(response);
    const json = await response.json();
    const inc = await fetchVoiceKnowledge(
      `/incidents/${request.args.incident_id}`,
      AbortSignal.timeout(10_000),
    );
    return {
      id: json.data.id,
      assetId: inc.data.assetId,
      requestId,
      source: 'voice' as const,
      incidentNumber: inc.data.incidentNumber,
      status: inc.data.status,
      note: request.args.note,
    };
  }
  throw new Error('Unknown write request');
}

export interface DashboardIncident {
  id: string;
  incidentNumber: string;
  title: string;
  description: string;
  faultCode: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'escalated' | 'resolved' | 'closed';
  assetId: string;
  asset?: {
    id: string;
    assetTag: string;
    name: string;
    location: string;
  };
  openedAt: string;
  resolvedAt: string | null;
  rootCause: string | null;
  actionTaken: string | null;
  assignedTo?: { id: string; name: string } | null;
  escalations: Array<{
    id: string;
    reason: string;
    severity: string;
    status: string;
    createdAt: string;
    acknowledgedAt: string | null;
    acknowledgedBy?: { id: string; name: string } | null;
  }>;
}

export interface IncidentDetail {
  id: string;
  incidentNumber: string;
  title: string;
  description: string;
  faultCode: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'investigating' | 'escalated' | 'resolved' | 'closed';
  assetId: string;
  asset?: {
    id: string;
    assetTag: string;
    name: string;
    location: string;
  };
  openedAt: string;
  resolvedAt: string | null;
  rootCause: string | null;
  actionTaken: string | null;
  resolutionSummary: string | null;
  openedBy?: { id: string; name: string };
  assignedTo?: { id: string; name: string } | null;
  notes: Array<{
    id: string;
    note: string;
    createdAt: string;
    source: string;
    author?: { name: string } | null;
  }>;
  measurements: Array<{
    id: string;
    measurementType: string;
    value: number;
    unit: string;
    recordedAt: string;
    notes?: string | null;
  }>;
  maintenanceRecord?: {
    id: string;
    symptom: string;
    rootCause: string;
    actionTaken: string;
    verification: string;
    performedAt: string;
    technician?: { name: string } | null;
  } | null;
  escalations: Array<{
    id: string;
    reason: string;
    severity: string;
    status: string;
    createdAt: string;
    acknowledgedAt: string | null;
    acknowledgedBy?: { id: string; name: string } | null;
  }>;
}

export interface SupervisorUser {
  id: string;
  name: string;
  role: 'technician' | 'supervisor';
}

export interface SupervisorReviewInput {
  acknowledgeEscalation?: boolean;
  assignedToId?: string | null;
  priority?: DashboardIncident['priority'];
  note?: string;
}

export async function fetchIncidents(): Promise<DashboardIncident[]> {
  const response = await apiFetch(`${baseUrl}/incidents`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return [];
  const json = await response.json();
  return json.data ?? [];
}

export async function fetchIncidentDetail(id: string): Promise<IncidentDetail> {
  const response = await apiFetch(`${baseUrl}/incidents/${id}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Incident details are unavailable.');
  const json = await response.json();
  return json.data;
}

export async function fetchSupervisorUsers(
  siteId?: string,
): Promise<SupervisorUser[]> {
  const url = siteId
    ? `${baseUrl}/incidents/assignees?siteId=${encodeURIComponent(siteId)}`
    : `${baseUrl}/incidents/assignees`;
  const response = await apiFetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Assignable users are unavailable.');
  return (await response.json()).data;
}

export async function submitSupervisorReview(
  incidentId: string,
  input: SupervisorReviewInput,
): Promise<IncidentDetail> {
  const response = await apiFetch(
    `${baseUrl}/incidents/${incidentId}/supervisor-review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error?.message ?? 'The supervisor review could not be saved.',
    );
  }
  return (await response.json()).data;
}

export async function submitIncidentNote(
  incidentId: string,
  note: string,
): Promise<{ id: string; note: string; createdAt: string }> {
  const response = await apiFetch(`${baseUrl}/incidents/${incidentId}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note, source: 'manual' }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? 'Failed to submit incident note.');
  }
  return (await response.json()).data;
}

export async function submitIncidentEscalation(
  incidentId: string,
  reason: string,
  severity: 'supervisor_review' | 'urgent' = 'supervisor_review',
): Promise<{ id: string; reason: string; severity: string; status: string }> {
  const response = await apiFetch(`${baseUrl}/incidents/${incidentId}/escalate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason, severity }),
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? 'Failed to escalate incident.');
  }
  return (await response.json()).data;
}

export interface CompleteRepairPayload {
  assetId: string;
  rootCause: string;
  actionTaken: string;
  verificationSummary: string;
  verificationMeasurement?: {
    measurementType: string;
    value: number;
    unit: string;
    notes?: string;
  };
  assetStatus?: 'operational' | 'warning' | 'maintenance' | 'down';
}

export async function submitCompleteRepair(
  incidentId: string,
  payload: CompleteRepairPayload,
): Promise<{
  incident: { id: string; incidentNumber: string; status: string };
  maintenanceRecord: { id: string };
  asset: { id: string; status: string };
}> {
  const response = await apiFetch(
    `${baseUrl}/incidents/${incidentId}/complete-repair`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, source: 'manual' }),
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(
      body?.error?.message ?? 'Failed to record repair completion.',
    );
  }
  return (await response.json()).data;
}
