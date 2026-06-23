'use client';

import { pageError } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { ProjectCldManage } from '../../project-cld-manage';
import BackButton from '@/components/buttons/back-button';

export default function ProjectCldPage() {
  const params = useParams();
  const projectId = String(params.projectId ?? '');
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [projectName, setProjectName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProject = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
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
    setLoading(false);
  }, [projectId, supabase]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
      <BackButton href="/crm/project" label="Projects" />
      </div>
      {projectId && projectName ? (
        <ProjectCldManage projectId={projectId} projectName={projectName} />
      ) : null}
    </div>
  );
}
