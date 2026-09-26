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

export async function fetchVoiceToken(signal: AbortSignal) {
  const response = await fetch(`${baseUrl}/voice/token`, {
    method: 'POST',
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
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
  const response = await fetch(`${baseUrl}/assets`, {
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
    fetch(`${baseUrl}/assets/${assetId}/history?limit=10`, {
      signal: AbortSignal.timeout(10_000),
    }),
    fetch(`${baseUrl}/assets/${assetId}/measurements?limit=6`, {
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
  const response = await fetch(
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
  const response = await fetch(`${baseUrl}${path}`, {
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

export async function previewVoiceWrite(
  request: import('@fieldmate/shared').WriteRequest,
  signal: AbortSignal,
) {
  const asset = assetSchema.parse(
    (await fetchVoiceKnowledge(`/assets/${request.args.asset_id}`, signal))
      .data,
  );
  const args = request.args;
  const details = [`Equipment: ${asset.assetTag} · ${asset.name}`];
  if (request.name === 'record_measurement') {
    details.push(
      `Reading: ${request.args.value} ${request.args.unit} (${request.args.measurement_type})`,
    );
    if (request.args.notes) details.push(`Notes: ${request.args.notes}`);
    if (request.args.incident_id) {
      const incident = await fetchVoiceKnowledge(
        `/incidents/${request.args.incident_id}`,
        signal,
      );
      if (
        incident.data.assetId !== asset.id ||
        !['open', 'investigating', 'escalated'].includes(incident.data.status)
      )
        throw new WriteRejected(
          'The incident must be active and belong to this asset. Nothing was submitted.',
        );
      details.push(`Attach to incident: ${incident.data.incidentNumber}`);
    } else details.push('Save as an unassigned reading on this asset.');
  } else {
    const draft = request.args;
    details.push(
      `Title: ${draft.title}`,
      `Description: ${draft.description}`,
      `Fault: ${draft.fault_code ?? 'Not specified'}`,
      `Priority: ${draft.priority}`,
      `Equipment status: ${asset.status === 'down' ? 'down (retained)' : draft.asset_status}`,
    );
    if (draft.measurement_ids?.length) {
      const readings = await fetchVoiceKnowledge(
        `/assets/${args.asset_id}/measurements?limit=100`,
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
  }
  return {
    title:
      request.name === 'record_measurement'
        ? 'Review measurement'
        : 'Review new incident',
    details,
  };
}
export async function submitVoiceWrite(
  request: import('@fieldmate/shared').WriteRequest,
  requestId: string,
) {
  const args = request.args;
  const body =
    request.name === 'record_measurement'
      ? {
          assetId: request.args.asset_id,
          incidentId: request.args.incident_id,
          measurementType: request.args.measurement_type,
          value: request.args.value,
          unit: request.args.unit,
          notes: request.args.notes,
        }
      : {
          assetId: args.asset_id,
          title: request.args.title,
          description: request.args.description,
          faultCode: request.args.fault_code,
          priority: request.args.priority,
          assetStatus: request.args.asset_status,
          measurementIds: request.args.measurement_ids,
        };
  const response = await fetch(
    `${baseUrl}/${request.name === 'record_measurement' ? 'measurements' : 'incidents'}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, requestId, source: 'voice' }),
      signal: AbortSignal.timeout(12_000),
    },
  );
  if (!response.ok) {
    if ([400, 404, 409].includes(response.status)) {
      const data = await response.json().catch(() => null);
      const messages: Record<string, string> = {
        REQUEST_ID_REUSED:
          'This save ID belongs to different data. Check the existing record before creating a new request.',
        INVALID_MEASUREMENT_LINK:
          'Readings must belong to this asset and be unassigned. Nothing was saved.',
        ASSET_MISMATCH:
          'The incident belongs to another asset. Nothing was saved.',
        INCIDENT_FINISHED:
          'The incident is no longer active. Nothing was saved.',
      };
      throw new WriteRejected(
        messages[data?.error?.code] ??
          'The server rejected this request. Review the asset, incident and reading details. Nothing new was saved.',
      );
    }
    throw new Error('Save outcome unknown');
  }
  const data = writeResultSchema.parse(await response.json()).data;
  if (
    request.name === 'record_measurement' &&
    (data.value !== request.args.value ||
      data.unit !== request.args.unit ||
      data.measurementType !== request.args.measurement_type)
  )
    throw new Error('Unexpected saved reading');
  if (request.name === 'create_incident' && !data.incidentNumber)
    throw new Error('Missing incident number');
  return data;
}
