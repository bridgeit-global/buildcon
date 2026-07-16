'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { pageError, toast } from '@/lib/toast';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  DOCUMENT_TEMPLATE_KINDS,
  DOCUMENT_TEMPLATE_KIND_LABEL,
  type DocumentTemplateKind,
  type DocumentTemplateRow
} from '@/lib/document-template/kinds';
import {
  documentTemplateFormPayload,
  documentTemplateFormSchema
} from '@/lib/document-template/document-template.schema';
import { DOCUMENT_TEMPLATE_PLACEHOLDERS } from '@/lib/document-template/placeholders';
import {
  DOCUMENT_TEMPLATE_SAMPLES,
  sampleTemplateDownloadName
} from '@/lib/document-template/sample-templates';
import { defaultDocumentTemplateRows } from '@/lib/document-template/default-template-rows';
import { renderDocumentTemplatePreviewHtml } from '@/lib/document-template/preview-sample-values';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { FormDialog } from '@/components/ui/form-dialog';
import { StatusChip } from '@/components/ui/status-chip';
import { CrmTableBodySkeleton } from '../_components/crm-skeletons';
import { Download, Eye, Pencil, Trash2, Upload } from 'lucide-react';

const TEMPLATE_SELECT =
  'id,project_id,name,category,doc_kind,body,is_active,created_at,updated_at';

export function ProjectDocumentTemplatesManage({
  projectId,
  projectName,
  canEdit
}: {
  projectId: string;
  projectName?: string;
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [rows, setRows] = useState<DocumentTemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [docKind, setDocKind] = useState<DocumentTemplateKind>('application-form');
  const [name, setName] = useState(DOCUMENT_TEMPLATE_KIND_LABEL['application-form']);
  const [body, setBody] = useState(DOCUMENT_TEMPLATE_SAMPLES['application-form']);
  const [isActive, setIsActive] = useState(true);

  const deferredBody = useDeferredValue(body);
  const livePreviewHtml = useMemo(
    () => renderDocumentTemplatePreviewHtml(deferredBody, { projectName }),
    [deferredBody, projectName]
  );
  const previewPending = deferredBody !== body;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogTitle, setDialogTitle] = useState('Template preview');
  const [dialogHtml, setDialogHtml] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<DocumentTemplateRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const usedKinds = useMemo(
    () => new Set(rows.map((r) => r.doc_kind)),
    [rows]
  );

  const availableKinds = useMemo(() => {
    if (editingId) return DOCUMENT_TEMPLATE_KINDS;
    return DOCUMENT_TEMPLATE_KINDS.filter((k) => !usedKinds.has(k));
  }, [editingId, usedKinds]);

  const missingKinds = useMemo(
    () => DOCUMENT_TEMPLATE_KINDS.filter((k) => !usedKinds.has(k)),
    [usedKinds]
  );

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('document_templates')
      .select(TEMPLATE_SELECT)
      .eq('project_id', projectId)
      .not('doc_kind', 'is', null)
      .order('doc_kind', { ascending: true });
    if (error) pageError(error.message);
    setRows((data ?? []) as DocumentTemplateRow[]);
    setLoading(false);
  }, [projectId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm(nextKind?: DocumentTemplateKind) {
    const kind =
      nextKind ??
      DOCUMENT_TEMPLATE_KINDS.find((k) => !usedKinds.has(k)) ??
      'application-form';
    setEditingId(null);
    setDocKind(kind);
    setName(DOCUMENT_TEMPLATE_KIND_LABEL[kind]);
    setBody(DOCUMENT_TEMPLATE_SAMPLES[kind]);
    setIsActive(true);
  }

  function startEdit(row: DocumentTemplateRow) {
    setEditingId(row.id);
    setDocKind(row.doc_kind);
    setName(row.name);
    setBody(row.body ?? '');
    setIsActive(row.is_active);
  }

  function onKindChange(kind: DocumentTemplateKind) {
    setDocKind(kind);
    if (!editingId) {
      setName(DOCUMENT_TEMPLATE_KIND_LABEL[kind]);
      setBody(DOCUMENT_TEMPLATE_SAMPLES[kind]);
    }
  }

  function downloadSample(kind: DocumentTemplateKind) {
    const html = DOCUMENT_TEMPLATE_SAMPLES[kind];
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sampleTemplateDownloadName(kind);
    a.click();
    URL.revokeObjectURL(url);
  }

  function openDialogPreview(htmlBody: string, title: string) {
    if (!htmlBody.trim()) {
      pageError('Add HTML content before previewing.');
      return;
    }
    setDialogTitle(title);
    setDialogHtml(renderDocumentTemplatePreviewHtml(htmlBody, { projectName }));
    setDialogOpen(true);
  }

  function previewSavedRow(row: DocumentTemplateRow) {
    openDialogPreview(
      row.body ?? '',
      `${DOCUMENT_TEMPLATE_KIND_LABEL[row.doc_kind]} preview`
    );
  }

  async function onUploadFile(file: File | null) {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.html') && file.type !== 'text/html') {
      pageError('Upload an .html template file.');
      return;
    }
    if (file.size > 500_000) {
      pageError('File is too large (max 500 KB).');
      return;
    }
    try {
      const text = await file.text();
      if (!text.trim()) {
        pageError('The HTML file is empty.');
        return;
      }
      setBody(text);
      if (!name.trim()) setName(file.name.replace(/\.html$/i, ''));
      toast.success('HTML template loaded into the editor.');
    } catch {
      pageError('Could not read the HTML file.');
    }
  }

  async function saveTemplate() {
    if (!canEdit) {
      pageError('Only Super Admin or Admin can manage document templates.');
      return;
    }
    const parsed = documentTemplateFormSchema.safeParse({
      doc_kind: docKind,
      name,
      body,
      is_active: isActive
    });
    if (!parsed.success) {
      pageError(parsed.error.issues[0]?.message ?? 'Check the form and try again.');
      return;
    }
    setSaving(true);
    try {
      const payload = documentTemplateFormPayload(projectId, parsed.data);
      if (editingId) {
        const { error } = await supabase
          .from('document_templates')
          .update({
            name: payload.name,
            body: payload.body,
            is_active: payload.is_active,
            category: payload.category
          })
          .eq('id', editingId)
          .eq('project_id', projectId);
        if (error) throw error;
        toast.success('Template updated.');
      } else {
        const { error } = await supabase.from('document_templates').insert(payload);
        if (error) throw error;
        toast.success('Template saved.');
      }
      await load();
      resetForm();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to save template');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: DocumentTemplateRow) {
    if (!canEdit) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('document_templates')
        .update({ is_active: !row.is_active })
        .eq('id', row.id);
      if (error) throw error;
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  }

  function requestDeleteTemplate(row: DocumentTemplateRow) {
    if (!canEdit) return;
    setDeleteTarget(row);
  }

  async function confirmDeleteTemplate() {
    if (!canEdit || !deleteTarget) return;
    setDeleting(true);
    try {
      const { error } = await supabase
        .from('document_templates')
        .delete()
        .eq('id', deleteTarget.id);
      if (error) throw error;
      toast.success('Template deleted.');
      if (editingId === deleteTarget.id) resetForm();
      setDeleteTarget(null);
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to delete template');
    } finally {
      setDeleting(false);
    }
  }

  async function installMissingDefaults() {
    if (!canEdit || missingKinds.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('document_templates')
        .insert(defaultDocumentTemplateRows(projectId, missingKinds));
      if (error) throw new Error(error.message);
      toast.success(
        `Installed ${missingKinds.length} default template${
          missingKinds.length === 1 ? '' : 's'
        } for this project.`
      );
      await load();
    } catch (e) {
      pageError(e instanceof Error ? e.message : 'Failed to install defaults');
    } finally {
      setSaving(false);
    }
  }

  const showEditor = canEdit && (editingId || availableKinds.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-ds-gray-900">Document templates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Project-scoped HTML templates for {projectName ?? 'this project'}. Every
          generated document (application form, allotment letter, receipt, demand
          letter, agreement, registration deed, possession letter) uses the active
          template mapped for this project. Use{' '}
          <code className="rounded bg-muted px-1 text-xs">{'{{placeholder}}'}</code>{' '}
          keys listed below.
        </p>
      </div>

      <Card className="overflow-hidden rounded-xl border-ds-gray-200 p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-ds-gray-900">Saved templates</h2>
          <div className="flex flex-wrap gap-2">
            {canEdit && missingKinds.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void installMissingDefaults()}
                disabled={saving}
              >
                Install missing defaults ({missingKinds.length})
              </Button>
            ) : null}
            {canEdit && availableKinds.length > 0 ? (
              <Button type="button" size="sm" variant="outline" onClick={() => resetForm()}>
                New template
              </Button>
            ) : null}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-160 caption-bottom text-sm">
            <thead>
              <tr className="border-b border-ds-gray-200 text-left text-ds-gray-500">
                <th className="px-2 py-2 font-medium">Document</th>
                <th className="px-2 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Status</th>
                <th className="px-2 py-2 font-medium">Updated</th>
                <th className="px-2 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <CrmTableBodySkeleton colSpan={5} rows={3} />
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-2 py-8 text-center text-muted-foreground">
                    No templates mapped for this project yet. Install defaults or upload
                    HTML below — document generation requires a project template per kind.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-ds-gray-100">
                    <td className="px-2 py-2.5 font-medium text-ds-gray-900">
                      {DOCUMENT_TEMPLATE_KIND_LABEL[row.doc_kind]}
                    </td>
                    <td className="px-2 py-2.5">{row.name}</td>
                    <td className="px-2 py-2.5">
                      <StatusChip tone={row.is_active ? 'success' : 'neutral'}>
                        {row.is_active ? 'Active' : 'Inactive'}
                      </StatusChip>
                    </td>
                    <td className="px-2 py-2.5 text-muted-foreground">
                      {row.updated_at
                        ? new Date(row.updated_at).toLocaleString()
                        : '—'}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => previewSavedRow(row)}
                        >
                          <Eye className="size-3.5" />
                          Preview
                        </Button>
                        {canEdit ? (
                          <>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => startEdit(row)}
                              disabled={saving}
                            >
                              <Pencil className="size-3.5" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => void toggleActive(row)}
                              disabled={saving}
                            >
                              {row.is_active ? 'Deactivate' : 'Activate'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={() => requestDeleteTemplate(row)}
                              disabled={saving || deleting}
                            >
                              <Trash2 className="size-3.5" />
                              Delete
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {canEdit ? (
        <Card className="rounded-xl border-ds-gray-200 p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-ds-gray-900">
            {editingId ? 'Edit template' : 'Add template'}
          </h2>
          {!showEditor ? (
            <p className="text-sm text-muted-foreground">
              All five document types already have a template. Edit or delete one to add
              another.
            </p>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="doc-kind">Document type</Label>
                  <Select
                    value={docKind}
                    onValueChange={(v) => onKindChange(v as DocumentTemplateKind)}
                    disabled={Boolean(editingId)}
                  >
                    <SelectTrigger id="doc-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(editingId ? DOCUMENT_TEMPLATE_KINDS : availableKinds).map((k) => (
                        <SelectItem key={k} value={k}>
                          {DOCUMENT_TEMPLATE_KIND_LABEL[k]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tpl-name">Template name</Label>
                  <Input
                    id="tpl-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Application form — Project A"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".html,text/html"
                  className="hidden"
                  onChange={(e) => {
                    void onUploadFile(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  Upload HTML
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => downloadSample(docKind)}
                >
                  <Download className="size-3.5" />
                  Download sample
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setBody(DOCUMENT_TEMPLATE_SAMPLES[docKind])}
                >
                  Load sample into editor
                </Button>
                <label className="ml-auto flex min-h-11 items-center gap-2 text-sm text-ds-gray-700">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="size-4 rounded border-ds-gray-300"
                  />
                  Active (use for generation)
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-4">
                <div className="flex min-h-0 flex-col gap-1.5">
                  <Label htmlFor="tpl-body">HTML code</Label>
                  <Textarea
                    id="tpl-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    className="min-h-72 flex-1 resize-y font-mono text-xs lg:min-h-128"
                    spellCheck={false}
                  />
                </div>
                <div className="flex min-h-0 flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label>Live preview</Label>
                    <span className="text-xs text-muted-foreground">
                      {previewPending ? 'Updating…' : 'Sample booking data'}
                    </span>
                  </div>
                  <div
                    className={`min-h-72 overflow-hidden rounded-lg border border-ds-gray-200 bg-ds-gray-50 lg:min-h-128 ${
                      previewPending ? 'opacity-70' : ''
                    }`}
                  >
                    <iframe
                      title={`${DOCUMENT_TEMPLATE_KIND_LABEL[docKind]} live preview`}
                      srcDoc={livePreviewHtml}
                      sandbox=""
                      className="h-72 w-full bg-white lg:h-128"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void saveTemplate()} disabled={saving}>
                  {saving ? 'Saving…' : editingId ? 'Update template' : 'Save template'}
                </Button>
                {editingId ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => resetForm()}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </Card>
      ) : (
        <Card className="rounded-xl border-ds-gray-200 p-4 shadow-sm">
          <p className="text-sm text-muted-foreground">
            View-only. Super Admin or Admin can upload and edit HTML templates. You can
            still preview saved templates from the table above.
          </p>
        </Card>
      )}

      <Dialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg border-ds-gray-200 p-0">
          <DialogHeader className="border-b border-ds-gray-100 bg-linear-to-br from-ds-error-50/60 to-card px-4 py-4 sm:px-6">
            <DialogTitle className="text-left text-base font-semibold text-ds-gray-900">
              Delete template
            </DialogTitle>
            <DialogDescription className="text-left text-xs text-ds-gray-600">
              {deleteTarget
                ? `Remove the ${DOCUMENT_TEMPLATE_KIND_LABEL[deleteTarget.doc_kind]} template${
                    deleteTarget.name ? ` (“${deleteTarget.name}”)` : ''
                  }. Generation for this kind will fail until a project template is mapped again.`
                : 'Remove this document template.'}
            </DialogDescription>
          </DialogHeader>
          <div className="px-4 py-4 sm:px-6">
            <p className="text-sm text-ds-gray-700">
              This cannot be undone. Previously generated PDFs are kept.
            </p>
          </div>
          <DialogFooter className="border-t border-ds-gray-100 bg-card px-4 py-3 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => void confirmDeleteTemplate()}
              disabled={deleting || !deleteTarget}
            >
              {deleting ? 'Deleting…' : 'Delete template'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={dialogTitle}
        description="Sample data is used for placeholders. Live booking values appear when you generate a document."
        className="w-[min(100vw-1.5rem,56rem)] sm:max-w-4xl"
        contentClassName="p-0 sm:px-0 sm:py-0"
        footer={
          <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
            Close
          </Button>
        }
      >
        <div className="bg-ds-gray-50 p-3 sm:p-4">
          <iframe
            title={dialogTitle}
            srcDoc={dialogHtml}
            sandbox=""
            className="h-[min(70vh,36rem)] w-full rounded-lg border border-ds-gray-200 bg-white"
          />
        </div>
      </FormDialog>

      <Card className="rounded-xl border-ds-gray-200 p-4 shadow-sm">
        <h2 className="mb-2 text-sm font-semibold text-ds-gray-900">Placeholders</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Insert these tokens in your HTML. They are replaced when a document is
          generated for a booking.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-md text-sm">
            <thead>
              <tr className="border-b border-ds-gray-200 text-left text-ds-gray-500">
                <th className="px-2 py-2 font-medium">Token</th>
                <th className="px-2 py-2 font-medium">Description</th>
              </tr>
            </thead>
            <tbody>
              {DOCUMENT_TEMPLATE_PLACEHOLDERS.map((p) => (
                <tr key={p.key} className="border-b border-ds-gray-100">
                  <td className="px-2 py-1.5 font-mono text-xs">{`{{${p.key}}}`}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{p.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
