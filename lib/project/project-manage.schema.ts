import { z } from 'zod';
import { nonNegativeNumberString } from '@/lib/form/common-fields';

export const projectDetailsSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required.'),
  location: z.string(),
  type: z.string().trim().min(1, 'Select a project type.'),
  status: z.string().trim().min(1, 'Select a status.'),
  fy: z.string(),
  rera_no: z.string(),
  base_rate: nonNegativeNumberString
});

export const projectPricingSchema = z.object({
  gstPct: nonNegativeNumberString,
  stampPct: nonNegativeNumberString,
  regFee: nonNegativeNumberString
});

export type ProjectDetailsValues = z.infer<typeof projectDetailsSchema>;
export type ProjectPricingValues = z.infer<typeof projectPricingSchema>;
