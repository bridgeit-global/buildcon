'use client';

import Link from 'next/link';
import { pageError } from '@/lib/toast';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProjectCldManage } from '../../project-cld-manage';

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
      <Card className="rounded-xl border-ds-gray-200 p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <Button variant="ghost" size="sm" className="-ml-2 mb-1 gap-1" asChild>
              <Link href="/crm/project">
                <ArrowLeft className="size-4" />
                Projects
              </Link>
            </Button>
            <h1 className="text-xl font-bold text-ds-gray-900 sm:text-[22px]">
              Construction-linked demand
            </h1>
            <p className="mt-0.5 text-xs text-ds-gray-500">
              {loading
                ? 'Loading project…'
                : projectName
                  ? projectName
                  : 'Configure payment milestones for this project.'}
            </p>
          </div>
        </div>
      </Card>

      {projectId && projectName ? (
        <ProjectCldManage projectId={projectId} projectName={projectName} />
      ) : null}
    </div>
  );
}
