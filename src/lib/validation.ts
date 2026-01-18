import { z } from "zod";

export const toneOptions = [
  "温馨治愈",
  "活泼俏皮",
  "专业测评",
  "种草安利",
  "简约高级",
] as const;

export const productInputSchema = z.object({
  product_id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  price: z.coerce.number().min(0),
  target_audience: z.string().min(1),
  features: z.array(z.string().min(1)).min(1),
  selling_point: z.string().min(1),
  tone: z.enum(toneOptions),
});

export type ProductInputForm = z.infer<typeof productInputSchema>;

export function coerceProductInput(value: unknown): ProductInputForm {
  return productInputSchema.parse(value);
}
