'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useActiveProjectContext } from '../../_components/active-project-context';
import { NewInquiryWizard } from '../new-inquiry-wizard';

export default function NewInquiryPage() {
  const { activeProjectId } = useActiveProjectContext();

  if (!activeProjectId) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Select a project to add an enquiry.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" className="gap-1 px-2" asChild>
          <Link href="/crm/inquiry">
            <ArrowLeft className="size-4" />
            Leads overview
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          New enquiry
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Same steps as the overview modal, on a dedicated page for longer entry
          sessions.
        </p>
      </div>
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border bg-muted/20 px-6 py-3">
          <p className="text-[11px] text-muted-foreground">
            Creates or updates a customer by mobile number, then saves the
            enquiry.
          </p>
        </div>
        <div className="px-6 py-4">
          <NewInquiryWizard projectId={activeProjectId} />
        </div>
      </Card>
    </div>
  );
}
