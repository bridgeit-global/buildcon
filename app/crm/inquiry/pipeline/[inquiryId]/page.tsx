'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../../../_components/active-project-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  InquiryPipelinePanel,
  type OpportunityRow
} from '../../inquiry-pipeline-dialog';

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

type InquiryPipelineFetchRow = {
  id: string;
  sales_opportunities: OpportunityRow | OpportunityRow[] | null;
};

export default function LeadPipelinePage() {
  const params = useParams();
  const router = useRouter();
  const inquiryId =
    typeof params.inquiryId === 'string' ? params.inquiryId : '';
  const { activeProjectId } = useActiveProjectContext();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [opportunity, setOpportunity] = useState<OpportunityRow | null>(null);

  const backHref = '/crm/inquiry';

  const loadOpportunity = useCallback(async () => {
    if (!activeProjectId || !inquiryId) {
      setLoading(false);
      setMissing(!inquiryId);
      setOpportunity(null);
      return;
    }
    setLoading(true);
    setMissing(false);
    const { data, error } = await supabase
      .from('sales_inquiries')
      .select(
        `
        id,
        sales_opportunities (
          id,
          funnel_stage,
          assigned_to,
          stage_data,
          sales_follow_ups ( id, due_at, note, completed_at ),
          sales_site_visits ( id, scheduled_at, status, outcome )
        )
      `
      )
      .eq('id', inquiryId)
      .eq('project_id', activeProjectId)
      .maybeSingle();

    setLoading(false);
    if (error || !data) {
      setMissing(true);
      setOpportunity(null);
      return;
    }
    const row = data as unknown as InquiryPipelineFetchRow;
    setOpportunity(embedOne(row.sales_opportunities));
  }, [activeProjectId, inquiryId, supabase]);

  useEffect(() => {
    void loadOpportunity();
  }, [loadOpportunity]);

  if (!activeProjectId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Select a project to manage inquiries.
      </Card>
    );
  }

  if (!inquiryId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Invalid inquiry link.
      </Card>
    );
  }

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1 px-2" asChild>
          <Link href={backHref}>
            <ArrowLeft className="size-4" />
            Enquiries
          </Link>
        </Button>
      </div>
      {loading ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Loading pipeline…
        </Card>
      ) : missing ? (
        <Card className="p-6 text-sm text-muted-foreground">
          This enquiry was not found for the current project, or you no longer
          have access.
          <div className="mt-4">
            <Button variant="outline" size="sm" asChild>
              <Link href={backHref}>Back to enquiries</Link>
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="max-h-[calc(100vh-8rem)] overflow-y-auto p-4 sm:p-6">
          <InquiryPipelinePanel
            projectId={activeProjectId}
            opportunity={opportunity}
            onSaved={() => {
              void loadOpportunity();
            }}
            onClose={() => {
              router.push(backHref);
            }}
          />
        </Card>
      )}
    </div>
  );
}
