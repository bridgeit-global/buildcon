'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import type { CrmProject } from '../_components/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type CreateProjectDraft = {
  name: string;
  location: string;
  type: 'Redevelopment' | 'Greenfield' | 'Mixed Use';
  status: 'Active' | 'Planning' | 'On Hold';
  fy: string;
  rera_no: string;
  floors_per_wing: number;
  units_per_floor: number;
  base_rate: number;
  min_rate: number;
  max_rate: number;
  wingsCsv: string;
  unitTypesCsv: string;
};

export default function ProjectSettingsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId, setActiveProjectId } = useActiveProjectContext();

  const [projects, setProjects] = useState<CrmProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<CreateProjectDraft>({
    name: '',
    location: '',
    type: 'Redevelopment',
    status: 'Active',
    fy: '2026-27',
    rera_no: '',
    floors_per_wing: 7,
    units_per_floor: 4,
    base_rate: 10500,
    min_rate: 9500,
    max_rate: 13000,
    wingsCsv: 'A,B,C',
    unitTypesCsv: '1BHK,2BHK,3BHK'
  });

  async function load() {
    setLoading(true);
    setError('');
    const { data, error } = await supabase
      .from('projects')
      .select(
        'id,name,location,type,status,fy,rera_no,floors_per_wing,units_per_floor,base_rate,min_rate,max_rate'
      )
      .order('created_at', { ascending: false });
    if (error) setError(error.message);
    setProjects((data ?? []) as CrmProject[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createProject() {
    setCreating(true);
    setError('');
    try {
      const wings = draft.wingsCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const unitTypes = draft.unitTypesCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch('/api/crm/projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          project: {
            name: draft.name,
            location: draft.location || null,
            type: draft.type,
            status: draft.status,
            fy: draft.fy || null,
            rera_no: draft.rera_no || null,
            floors_per_wing: Number(draft.floors_per_wing || 1),
            units_per_floor: Number(draft.units_per_floor || 1),
            base_rate: Number(draft.base_rate || 0) || null,
            min_rate: Number(draft.min_rate || 0) || null,
            max_rate: Number(draft.max_rate || 0) || null
          },
          wings,
          unitTypes
        })
      });

      const json = (await res.json()) as { projectId?: string; error?: string };
      if (!res.ok) throw new Error(json.error || 'Failed to create project');

      setOpen(false);
      await load();
      if (json.projectId) setActiveProjectId(json.projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create project');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-semibold text-gray-900">
            Project Settings
          </div>
          <div className="text-xs text-gray-500">
            Create projects, seed inventory, and switch scope.
          </div>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>Create project</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create project</DialogTitle>
            </DialogHeader>

            {error ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Project name</Label>
                <Input
                  value={draft.name}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, name: e.target.value }))
                  }
                  placeholder="e.g. Sunrise Residency"
                />
              </div>
              <div className="col-span-2">
                <Label>Location</Label>
                <Input
                  value={draft.location}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, location: e.target.value }))
                  }
                  placeholder="e.g. Pune, Maharashtra"
                />
              </div>
              <div>
                <Label>Type</Label>
                <select
                  value={draft.type}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      type: e.target.value as CreateProjectDraft['type']
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option>Redevelopment</option>
                  <option>Greenfield</option>
                  <option>Mixed Use</option>
                </select>
              </div>
              <div>
                <Label>Status</Label>
                <select
                  value={draft.status}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      status: e.target.value as CreateProjectDraft['status']
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option>Active</option>
                  <option>Planning</option>
                  <option>On Hold</option>
                </select>
              </div>
              <div>
                <Label>FY</Label>
                <Input
                  value={draft.fy}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, fy: e.target.value }))
                  }
                  placeholder="2026-27"
                />
              </div>
              <div>
                <Label>RERA No.</Label>
                <Input
                  value={draft.rera_no}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, rera_no: e.target.value }))
                  }
                  placeholder="e.g. P52100012345"
                />
              </div>

              <div>
                <Label>Floors per wing</Label>
                <Input
                  type="number"
                  value={draft.floors_per_wing}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      floors_per_wing: Number(e.target.value)
                    }))
                  }
                />
              </div>
              <div>
                <Label>Units per floor</Label>
                <Input
                  type="number"
                  value={draft.units_per_floor}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      units_per_floor: Number(e.target.value)
                    }))
                  }
                />
              </div>

              <div>
                <Label>Base rate (₹/sq.ft)</Label>
                <Input
                  type="number"
                  value={draft.base_rate}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      base_rate: Number(e.target.value)
                    }))
                  }
                />
              </div>
              <div>
                <Label>Min / Max rate</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    value={draft.min_rate}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        min_rate: Number(e.target.value)
                      }))
                    }
                  />
                  <Input
                    type="number"
                    value={draft.max_rate}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        max_rate: Number(e.target.value)
                      }))
                    }
                  />
                </div>
              </div>

              <div className="col-span-2">
                <Label>Wings (comma-separated)</Label>
                <Input
                  value={draft.wingsCsv}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, wingsCsv: e.target.value }))
                  }
                  placeholder="A,B,C or Tower 1,Tower 2"
                />
              </div>
              <div className="col-span-2">
                <Label>Unit types (comma-separated)</Label>
                <Input
                  value={draft.unitTypesCsv}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, unitTypesCsv: e.target.value }))
                  }
                  placeholder="1BHK,2BHK,3BHK"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={creating}
              >
                Cancel
              </Button>
              <Button onClick={createProject} disabled={creating || !draft.name}>
                {creating ? 'Creating…' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              Accessible projects
            </div>
            <div className="text-xs text-gray-500">
              {loading ? 'Loading…' : `${projects.length} project(s)`}
            </div>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            Refresh
          </Button>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-2">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setActiveProjectId(p.id)}
              className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                activeProjectId === p.id
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <div className="text-sm font-semibold text-gray-900">{p.name}</div>
              <div className="text-xs text-gray-500">
                {p.type} · {p.status} · FY {p.fy ?? '—'}
              </div>
              <div className="mt-1 text-xs text-gray-500">
                Wings: {p.floors_per_wing} floors · {p.units_per_floor} units/floor
              </div>
            </button>
          ))}

          {!loading && projects.length === 0 ? (
            <div className="mt-6 text-sm text-gray-500">
              No projects are accessible yet. Create one (Super Admin) or ask an
              admin to add you to `project_members`.
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

