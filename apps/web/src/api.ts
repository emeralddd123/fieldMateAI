import { assetsResponseSchema } from '@fieldmate/shared';

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
