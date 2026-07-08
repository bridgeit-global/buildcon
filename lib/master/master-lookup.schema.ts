import { z } from 'zod';
import { MASTER_LOOKUP_KINDS } from './master-lookup';

export const masterLookupKindSchema = z.enum(MASTER_LOOKUP_KINDS);

export const masterLookupFormSchema = z.object({
  kind: masterLookupKindSchema,
  name: z.string().trim().min(1, 'Name is required.'),
  sort_order: z.number().int().min(0),
  is_active: z.boolean()
});

export type MasterLookupFormValues = z.infer<typeof masterLookupFormSchema>;

export function masterLookupFormPayload(values: MasterLookupFormValues) {
  return {
    kind: values.kind,
    name: values.name.trim(),
    sort_order: values.sort_order,
    is_active: values.is_active
  };
}
