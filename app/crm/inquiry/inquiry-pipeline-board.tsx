'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { FUNNEL_STAGES, type OpportunityRow } from './inquiry-pipeline-dialog';

function embedOne<T>(x: T | T[] | null | undefined): T | null {
  if (x == null) return null;
  return Array.isArray(x) ? (x[0] ?? null) : x;
}

export type PipelineBoardInquiry = {
  id: string;
  created_at: string;
  customers:
    | { full_name: string; phone?: string | null }
    | { full_name: string; phone?: string | null }[]
    | null;
  units:
    | { unit_code: string; wing_name: string }
    | { unit_code: string; wing_name: string }[]
    | null;
  sales_opportunities?: OpportunityRow | OpportunityRow[] | null;
};

function unitDisplayName(u: { unit_code: string; wing_name: string }) {
  return `${u.unit_code} · ${u.wing_name}`;
}

type Props = {
  inquiries: PipelineBoardInquiry[];
  loading: boolean;
  pendingInquiryId: string | null;
  onStageChange: (
    inquiryId: string,
    stage: (typeof FUNNEL_STAGES)[number]
  ) => void | Promise<void>;
  onOpenPipeline: (inquiryId: string) => void;
};

/** Primary sales flow columns (left); outcome stages stay usable on the same board. */
export const PIPELINE_KANBAN_STAGES = [
  'Enquiry',
  'Qualified',
  'Site Visit',
  'Negotiation',
  'Token'
] as const;

export function InquiryPipelineBoard(props: Props) {
  const {
    inquiries,
    loading,
    pendingInquiryId,
    onStageChange,
    onOpenPipeline
  } = props;

  const [dragInquiryId, setDragInquiryId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const byStage = useMemo(() => {
    const map = new Map<string, PipelineBoardInquiry[]>();
    for (const s of FUNNEL_STAGES) {
      map.set(s, []);
    }
    const sorted = [...inquiries].sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    for (const inq of sorted) {
      const raw = embedOne(inq.sales_opportunities)?.funnel_stage?.trim();
      const stage =
        raw && (FUNNEL_STAGES as readonly string[]).includes(raw) ? raw : 'Enquiry';
      const list = map.get(stage) ?? [];
      list.push(inq);
      map.set(stage, list);
    }
    return map;
  }, [inquiries]);

  return (
    <div className="space-y-3">
      <div className="flex gap-3 overflow-x-auto pb-1 pt-1 [-ms-overflow-style:none] [scrollbar-width:thin]">
        {FUNNEL_STAGES.map((stage) => {
          const column = byStage.get(stage) ?? [];
          const isOutcome = !(PIPELINE_KANBAN_STAGES as readonly string[]).includes(
            stage
          );
          return (
            <div
              key={stage}
              className={cn(
                'flex w-[min(100%,220px)] shrink-0 flex-col rounded-lg border bg-muted/15',
                isOutcome ? 'border-border/80' : 'border-border',
                dragOverStage === stage && 'ring-2 ring-blue-400/60'
              )}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                const id = e.dataTransfer.getData('application/x-inquiry-id');
                if (!id) return;
                if (pendingInquiryId) return;
                void onStageChange(id, stage);
                setDragInquiryId(null);
              }}
            >
              <div
                className={cn(
                  'border-b px-2.5 py-2',
                  isOutcome ? 'bg-muted/40' : 'bg-muted/25'
                )}
              >
                <div className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  {stage}
                </div>
                <div className="text-lg font-semibold tabular-nums text-foreground">
                  {loading ? '…' : column.length}
                </div>
              </div>
              <div className="flex min-h-[100px] flex-1 flex-col gap-2 p-2">
                {column.map((inq) => {
                  const c = embedOne(inq.customers);
                  const u = embedOne(inq.units);
                  const busy = pendingInquiryId === inq.id;
                  const dragging = dragInquiryId === inq.id;
                  return (
                    <button
                      key={inq.id}
                      type="button"
                      draggable={!busy}
                      onDragStart={(e) => {
                        e.dataTransfer.setData('application/x-inquiry-id', inq.id);
                        e.dataTransfer.effectAllowed = 'move';
                        setDragInquiryId(inq.id);
                      }}
                      onDragEnd={() => setDragInquiryId(null)}
                      onClick={() => onOpenPipeline(inq.id)}
                      className={cn(
                        'w-full cursor-grab rounded-md border border-border bg-card p-2.5 text-left text-xs shadow-sm transition-[opacity,transform] active:cursor-grabbing',
                        dragging && 'opacity-50',
                        busy && 'pointer-events-none opacity-60'
                      )}
                    >
                      <div className="font-semibold leading-snug text-foreground">
                        {c?.full_name ?? '—'}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {u ? unitDisplayName(u) : 'No unit'}
                      </div>
                      {c?.phone ? (
                        <div className="mt-1 truncate text-[10px] text-muted-foreground">
                          {c.phone}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
