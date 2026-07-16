import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  DOCUMENT_TEMPLATE_KINDS,
  type DocumentTemplateKind
} from '@/lib/document-template/kinds';
import { defaultDocumentTemplateRows } from '@/lib/document-template/default-template-rows';

export type EnsureProjectDocumentTemplatesResult = {
  inserted: DocumentTemplateKind[];
  existing: DocumentTemplateKind[];
  error?: string;
};

/**
 * Ensures every generatable document kind has a project-scoped template row.
 * Missing kinds are inserted from sample HTML (active). Existing rows are left unchanged.
 */
export async function ensureProjectDocumentTemplates(
  admin: SupabaseClient,
  projectId: string,
  kinds: readonly DocumentTemplateKind[] = DOCUMENT_TEMPLATE_KINDS
): Promise<EnsureProjectDocumentTemplatesResult> {
  const { data, error } = await admin
    .from('document_templates')
    .select('doc_kind')
    .eq('project_id', projectId)
    .not('doc_kind', 'is', null);

  if (error) {
    return { inserted: [], existing: [], error: error.message };
  }

  const existing = new Set(
    (data ?? [])
      .map((r) => r.doc_kind as string)
      .filter((k): k is DocumentTemplateKind =>
        (DOCUMENT_TEMPLATE_KINDS as readonly string[]).includes(k)
      )
  );

  const missing = kinds.filter((k) => !existing.has(k));
  if (missing.length === 0) {
    return { inserted: [], existing: [...existing] };
  }

  const { error: insErr } = await admin
    .from('document_templates')
    .insert(defaultDocumentTemplateRows(projectId, missing));
  if (insErr) {
    // Concurrent generate/create may race on the unique (project_id, doc_kind) index.
    const code = (insErr as { code?: string }).code;
    if (code === '23505') {
      return { inserted: [], existing: [...existing, ...missing] };
    }
    return { inserted: [], existing: [...existing], error: insErr.message };
  }

  return {
    inserted: missing,
    existing: [...existing]
  };
}

/** Ensure a single kind exists for the project (used before PDF generation). */
export async function ensureProjectDocumentTemplateKind(
  admin: SupabaseClient,
  projectId: string,
  kind: DocumentTemplateKind
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await ensureProjectDocumentTemplates(admin, projectId, [kind]);
  if (result.error) return { ok: false, error: result.error };
  return { ok: true };
}
