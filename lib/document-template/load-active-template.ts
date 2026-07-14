import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isDocumentTemplateKind,
  type DocumentTemplateKind
} from '@/lib/document-template/kinds';

export type ActiveDocumentTemplate = {
  id: string;
  doc_kind: DocumentTemplateKind;
  body: string;
};

/** Load the active HTML template for a project + document kind, if any. */
export async function loadActiveDocumentTemplate(
  admin: SupabaseClient,
  projectId: string,
  kind: string
): Promise<ActiveDocumentTemplate | null> {
  if (!isDocumentTemplateKind(kind)) return null;

  const { data, error } = await admin
    .from('document_templates')
    .select('id,doc_kind,body,is_active')
    .eq('project_id', projectId)
    .eq('doc_kind', kind)
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;
  const body = typeof data.body === 'string' ? data.body.trim() : '';
  if (!body) return null;
  if (!isDocumentTemplateKind(String(data.doc_kind))) return null;

  return {
    id: data.id as string,
    doc_kind: data.doc_kind as DocumentTemplateKind,
    body
  };
}
