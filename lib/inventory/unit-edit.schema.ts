import { z } from 'zod';
import { isUnitBlockedStatus } from '@/app/crm/inventory/unit-status';

export const unitEditSchema = z
  .object({
    unit_code: z.string().trim().min(1, 'Unit code is required.'),
    area: z.number().refine((n) => n >= 1, { message: 'Area must be at least 1 sq.ft.' }),
    rate: z.number().refine((n) => n >= 1, { message: 'Rate must be at least ₹1.' }),
    status: z.string().trim().min(1, 'Select a status.'),
    blocked_reason: z.string()
  })
  .superRefine((data, ctx) => {
    if (isUnitBlockedStatus(data.status) && !data.blocked_reason.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['blocked_reason'],
        message: 'Enter a reason when blocking this unit.'
      });
    }
  });

export type UnitEditValues = z.infer<typeof unitEditSchema>;

export const unitBlockSchema = z.object({
  blockUnitId: z.string().trim().min(1, 'Select a unit to block.'),
  blockReason: z.string().trim().min(1, 'Enter a reason for blocking.')
});

export type UnitBlockValues = z.infer<typeof unitBlockSchema>;
