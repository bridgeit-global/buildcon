import { z } from 'zod';

export const possessionSnagSchema = z.object({
  description: z.string().trim().min(1, 'Enter a snag description.')
});

export type PossessionSnagValues = z.infer<typeof possessionSnagSchema>;
