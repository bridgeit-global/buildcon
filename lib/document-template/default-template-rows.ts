import {
  DOCUMENT_TEMPLATE_KIND_LABEL,
  DOCUMENT_TEMPLATE_KINDS,
  type DocumentTemplateKind
} from '@/lib/document-template/kinds';
import { DOCUMENT_TEMPLATE_SAMPLES } from '@/lib/document-template/sample-templates';

/** Insert payload for a project-scoped default template (sample HTML). */
export function defaultDocumentTemplateRow(
  projectId: string,
  doc_kind: DocumentTemplateKind
) {
  return {
    project_id: projectId,
    doc_kind,
    name: DOCUMENT_TEMPLATE_KIND_LABEL[doc_kind],
    category: 'Sales',
    body: DOCUMENT_TEMPLATE_SAMPLES[doc_kind],
    is_active: true
  };
}

export function defaultDocumentTemplateRows(
  projectId: string,
  kinds: readonly DocumentTemplateKind[] = DOCUMENT_TEMPLATE_KINDS
) {
  return kinds.map((kind) => defaultDocumentTemplateRow(projectId, kind));
}
