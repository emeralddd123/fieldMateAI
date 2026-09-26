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
