'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useCrmProjectsContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

type TemplateRow = {
  id: string;
  project_id: string;
  name: string;
  category: string;
  created_at: string;
  projects: { name: string } | { name: string }[] | null;
};

type GeneratedRow = {
  id: string;
  project_id: string;
  template_id: string | null;
  storage_path: string;
  generated_at: string;
  projects: { name: string } | { name: string }[] | null;
};

function projectLabel(p: { name: string } | { name: string }[] | null | undefined) {
  if (!p) return '—';
  const row = Array.isArray(p) ? p[0] : p;
  return row?.name ?? '—';
}

export default function DocumentsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { projects } = useCrmProjectsContext();

  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [generated, setGenerated] = useState<GeneratedRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    project_id: '',
    name: '',
    category: 'Sales'
  });

  useEffect(() => {
    if (!draft.project_id && projects[0]) {
      setDraft((d) => ({ ...d, project_id: projects[0]!.id }));
    }
  }, [projects, draft.project_id]);

  async function load() {
    setLoading(true);
    setError('');
    const [{ data: tData, error: tErr }, { data: gData, error: gErr }] =
      await Promise.all([
        supabase
          .from('document_templates')
          .select('id,project_id,name,category,created_at,projects(name)')
          .order('created_at', { ascending: false })
          .limit(200),
        supabase
          .from('generated_documents')
          .select('id,project_id,template_id,storage_path,generated_at,projects(name)')
          .order('generated_at', { ascending: false })
          .limit(50)
      ]);
    if (tErr) setError(tErr.message);
    if (gErr) setError(gErr.message);
    setTemplates((tData ?? []) as TemplateRow[]);
    setGenerated((gData ?? []) as GeneratedRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = templates.filter((t) => {
    if (category !== 'All' && t.category !== category) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()))
      return false;
    return true;
  });

  async function createTemplate() {
    if (!draft.project_id || !draft.name) return;
    setSaving(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('document_templates')
        .insert({
          project_id: draft.project_id,
          name: draft.name,
          category: draft.category
        })
        .select('id,name,category,created_at')
        .single();
      if (error) throw error;
      setTemplates((ts) => [data as TemplateRow, ...ts]);
      setDraft({ project_id: draft.project_id, name: '', category: 'Sales' });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create template');
    } finally {
      setSaving(false);
    }
  }

  async function generateFromTemplate(template: TemplateRow) {
    setError('');
    // MVP: create a generated_documents record only. PDF rendering + storage upload is phase 2.
    const storagePath = `documents/project/${template.project_id}/${template.category}/${crypto.randomUUID()}.pdf`;
    const { error } = await supabase.from('generated_documents').insert({
      project_id: template.project_id,
      template_id: template.id,
      storage_path: storagePath
    });
    if (error) setError(error.message);
    await load();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['All', 'Sales', 'Legal', 'Other'].map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[260px]">
            <Label>Search</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search template…"
            />
          </div>

          <div className="flex-1" />

          <Button variant="outline" onClick={load} disabled={loading}>
            {loading ? 'Loading…' : 'Refresh'}
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Create template</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Create template</DialogTitle>
              </DialogHeader>
              {error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label>Project</Label>
                  <Select
                    value={draft.project_id || undefined}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, project_id: v }))
                    }
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Name</Label>
                  <Input
                    value={draft.name}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    placeholder="Allotment Letter"
                  />
                </div>
                <div className="col-span-2">
                  <Label>Category</Label>
                  <Select
                    value={draft.category}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, category: v }))
                    }
                  >
                    <SelectTrigger className="mt-1 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['Sales', 'Legal', 'Other'].map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  onClick={createTemplate}
                  disabled={saving || !draft.name || !draft.project_id}
                >
                  {saving ? 'Saving…' : 'Save'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-white flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">Templates</div>
            <div className="text-xs text-gray-500">{filtered.length} template(s)</div>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {['Project', 'Name', 'Category', 'Created', 'Action'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold border-b">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="max-w-[140px] truncate px-4 py-3 text-gray-600">
                    {projectLabel(t.projects)}
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{t.name}</td>
                  <td className="px-4 py-3 text-gray-600">{t.category}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <Button size="sm" variant="outline" onClick={() => generateFromTemplate(t)}>
                      Generate
                    </Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                    No templates yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b bg-white">
          <div className="text-sm font-semibold text-gray-900">Generated</div>
          <div className="text-xs text-gray-500">
            Latest generated documents (records only for MVP)
          </div>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500">
              <tr>
                {['Project', 'Generated at', 'Storage path'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left font-semibold border-b">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {generated.map((g) => (
                <tr key={g.id} className="border-b">
                  <td className="max-w-[140px] truncate px-4 py-3 text-gray-600">
                    {projectLabel(g.projects)}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {new Date(g.generated_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-700">
                    {g.storage_path}
                  </td>
                </tr>
              ))}
              {generated.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-gray-500">
                    No generated records yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

