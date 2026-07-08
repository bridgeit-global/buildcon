'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { sortingStateToQuery } from '@/lib/crm/list-sort';
import { useServerListSorting } from '@/components/data-table/crm-table-features';
import type { CrmProjectListItem } from '../_components/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProjectListTable } from './project-list-table';
import { ProjectManageDialog } from './project-manage-dialog';
import { canCreateProject as userCanCreateProject, isOrgAdmin, inviteProfileRoles } from '@/lib/profile-roles';
import { pageError } from '@/lib/toast';

type ProfileRow = { id: string; name: string | null; role: string };

export default function ProjectPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [listItems, setListItems] = useState<CrmProjectListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [myProfile, setMyProfile] = useState<ProfileRow | null>(null);

  const [manageOpen, setManageOpen] = useState(false);
  const [manageProject, setManageProject] = useState<CrmProjectListItem | null>(null);
  const { sorting, onSortingChange } = useServerListSorting();

  const canCreateProject = userCanCreateProject(myProfile?.role);
  const isSuperAdmin = isOrgAdmin(myProfile?.role);

  const loadProjectsList = useCallback(async () => {
    setListLoading(true);
    try {
      const params = new URLSearchParams();
      const sortQuery = sortingStateToQuery(sorting);
      if (sortQuery.sort) params.set('sort', sortQuery.sort);
      if (sortQuery.sortDir) params.set('sortDir', sortQuery.sortDir);
      const qs = params.toString();
      const res = await fetch(`/api/crm/projects${qs ? `?${qs}` : ''}`, { method: 'GET' });
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
      pageError(e instanceof Error ? e.message : 'Failed to load projects');
    } finally {
      setListLoading(false);
    }
  }, [sorting]);

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
  }, [loadProfile]);

  useEffect(() => {
    void loadProjectsList();
  }, [loadProjectsList]);

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

      </Card>

      <ProjectListTable
        projects={listItems}
        loading={listLoading}
        canCreateProject={canCreateProject}
        onManage={openManage}
        sorting={sorting}
        onSortingChange={onSortingChange}
      />

      <ProjectManageDialog
        open={manageOpen}
        onOpenChange={setManageOpen}
        project={manageProject}
        supabase={supabase}
        isSuperAdmin={isSuperAdmin}
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
