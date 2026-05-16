'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { CrmProjectListItem } from '../_components/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProjectListTable } from './project-list-table';
import { ProjectManageDialog } from './project-manage-dialog';

type ProfileRow = { id: string; name: string | null; role: string };

export default function ProjectPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [listItems, setListItems] = useState<CrmProjectListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);

  const [manageOpen, setManageOpen] = useState(false);
  const [manageProject, setManageProject] = useState<CrmProjectListItem | null>(null);

  const canCreateProject = myProfile?.role === 'Super Admin';

  const loadProjectsList = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const res = await fetch('/api/crm/projects', { method: 'GET' });
      const json = (await res.json()) as {
        projects?: CrmProjectListItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'Failed to load projects');
      const projects = json.projects ?? [];
      setListItems(projects);
      setManageProject((prev) =>
        prev ? projects.find((p) => p.id === prev.id) ?? prev : null
      );
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async () => {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      setMyProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('id,name,role')
      .eq('id', user.id)
      .maybeSingle();
    setMyProfile((data ?? null) as ProfileRow | null);
  }, [supabase]);

  useEffect(() => {
    void loadProfile();
    void loadProjectsList();
  }, [loadProfile, loadProjectsList]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('create') === '1') {
      router.replace('/crm/project/create', { scroll: false });
    }
  }, [router]);

  function openManage(project: CrmProjectListItem) {
    setManageProject(project);
    setManageOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-xl border-ds-gray-200 p-4 shadow-sm">
        <PageHeader
          canCreateProject={canCreateProject}
          listLoading={listLoading}
          onRefresh={() => {
            void loadProfile();
            void loadProjectsList();
          }}
        />

        {listError ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {listError}
          </div>
        ) : null}
      </Card>

      <ProjectListTable
        projects={listItems}
        loading={listLoading}
        canCreateProject={canCreateProject}
        onManage={openManage}
      />

      <ProjectManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        project={manageProject}
        supabase={supabase}
        isSuperAdmin={canCreateProject}
        onUpdated={() => void loadProjectsList()}
      />
    </div>
  );
}

function PageHeader({
  canCreateProject,
  listLoading,
  onRefresh
}: {
  canCreateProject: boolean;
  listLoading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-ds-gray-900 sm:text-[22px]">Projects</h1>
        <p className="mt-0.5 text-xs text-ds-gray-500">
          View all sites, open the dashboard, and manage members and settings.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={onRefresh} disabled={listLoading}>
          Refresh
        </Button>
        {canCreateProject ? (
          <Button asChild>
            <Link href="/crm/project/create">Create project</Link>
          </Button>
        ) : (
          <Button type="button" disabled>
            Create project
          </Button>
        )}
      </div>
    </div>
  );
}
