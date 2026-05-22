import { z } from 'zod';

export const cldStageSchema = z.object({
  name: z.string().trim().min(1, 'Stage name is required.')
});

export type CldStageValues = z.infer<typeof cldStageSchema>;
