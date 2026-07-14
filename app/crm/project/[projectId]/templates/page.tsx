'use client';

import { pageError } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { ProjectDocumentTemplatesManage } from '../../project-document-templates-manage';
import BackButton from '@/components/buttons/back-button';
import { isOrgAdmin } from '@/lib/profile-roles';

export default function ProjectDocumentTemplatesPage() {
  const params = useParams();
  const projectId = String(params.projectId ?? '');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [projectName, setProjectName] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      setCanEdit(isOrgAdmin(profile?.role as string | null));
    } else {
      setCanEdit(false);
    }

    const { data, error: qErr } = await supabase
      .from('projects')
      .select('id,name')
      .eq('id', projectId)
      .maybeSingle();
    if (qErr) {
      pageError(qErr.message);
      setProjectName(null);
    } else if (!data) {
      pageError('Project not found');
      setProjectName(null);
    } else {
      setProjectName(data.name as string);
    }
  }, [projectId, supabase]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <BackButton href="/crm/project" label="Projects" />
      </div>
      {projectId && projectName ? (
        <ProjectDocumentTemplatesManage
          projectId={projectId}
          projectName={projectName}
          canEdit={canEdit}
        />
      ) : null}
    </div>
  );
}
