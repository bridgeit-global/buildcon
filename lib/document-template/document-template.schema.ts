import { z } from 'zod';
import {
  DOCUMENT_TEMPLATE_KINDS,
  DOCUMENT_TEMPLATE_KIND_LABEL
} from '@/lib/document-template/kinds';

export const documentTemplateFormSchema = z.object({
  doc_kind: z.enum(DOCUMENT_TEMPLATE_KINDS),
  name: z
    .string()
    .trim()
    .min(1, 'Template name is required.')
    .max(120, 'Name must be 120 characters or less.'),
  body: z
    .string()
    .trim()
    .min(1, 'HTML template body is required.')
    .max(500_000, 'Template is too large (max 500 KB of text).'),
  is_active: z.boolean()
});

export type DocumentTemplateFormValues = z.infer<typeof documentTemplateFormSchema>;

export function documentTemplateFormPayload(
  projectId: string,
  values: DocumentTemplateFormValues
) {
  return {
    project_id: projectId,
    doc_kind: values.doc_kind,
    name: values.name.trim() || DOCUMENT_TEMPLATE_KIND_LABEL[values.doc_kind],
    category: 'Sales',
    body: values.body,
    is_active: values.is_active
  };
}
