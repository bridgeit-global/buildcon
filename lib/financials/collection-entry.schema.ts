import { z } from 'zod';

export const collectionEntrySchema = z
  .object({
    entryAmount: z.string().refine(
      (v) => {
        const n = Number(String(v).replace(/,/g, '').trim());
        return Number.isFinite(n) && n > 0;
      },
      { message: 'Enter a positive amount.' }
    ),
    entryDate: z.string().trim().min(1, 'Select the receipt date.'),
    entryMode: z.string().trim().min(1, 'Select payment mode.'),
    entryRef: z.string()
  })
  .superRefine((data, ctx) => {
    if (data.entryMode !== 'Cash' && !data.entryRef.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter the UTR / Cheque No.',
        path: ['entryRef']
      });
    }
  });

export type CollectionEntryValues = z.infer<typeof collectionEntrySchema>;
