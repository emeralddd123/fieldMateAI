import {
  assetsResponseSchema,
  maintenanceHistorySchema,
  measurementsResponseSchema,
} from '@fieldmate/shared';

const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(
  /\/$/,
  '',
);

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
