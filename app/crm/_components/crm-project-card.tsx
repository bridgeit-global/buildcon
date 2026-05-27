'use client';

import type { CrmProjectListItem } from './types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatInr } from '../inr-format';

const PROJECT_TYPE_ACCENT: Record<string, string> = {
  Redevelopment: '#8B5CF6',
  Greenfield: '#22C55E',
  'Mixed Use': '#06B6D4',
  Development: '#0D9488',
  Ready: '#0F766E'
};

const STATUS_BADGE: Record<
  string,
  { bg: string; text: string }
> = {
  Active: { bg: '#DCFCE7', text: '#16A34A' },
  Planning: { bg: '#FEF3C7', text: '#92400E' },
  'On Hold': { bg: '#F1F5F9', text: '#64748B' },
  Inactive: { bg: '#F1F5F9', text: '#64748B' }
};

function accentForType(type: string) {
  return PROJECT_TYPE_ACCENT[type] ?? '#64748B';
}

function badgeForStatus(status: string) {
  return STATUS_BADGE[status] ?? { bg: '#F1F5F9', text: '#64748B' };
}

export type CrmProjectCardProps = {
  project: CrmProjectListItem;
  focusProjectId: string | null;
  onOpen: () => void;
  onEdit: () => void;
  onInventory: () => void;
  onSettings: () => void;
};

export function CrmProjectCard({
  project: p,
  focusProjectId,
  onOpen,
  onEdit,
  onInventory,
  onSettings
}: CrmProjectCardProps) {
  const typeColor = accentForType(p.type);
  const [sc, tc] = (() => {
    const b = badgeForStatus(p.status);
    return [b.bg, b.text] as const;
  })();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'cursor-pointer border-2 bg-white p-5 text-left shadow-sm transition-colors',
        'hover:border-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30',
        focusProjectId === p.id ? 'border-blue-300 ring-1 ring-blue-100' : 'border-transparent'
      )}
    >
      <div className="flex justify-between gap-2">
        <div
          className="flex size-[42px] shrink-0 items-center justify-center text-xl"
          style={{ backgroundColor: `${typeColor}22` }}
          aria-hidden
        >
          🏗
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span
            className="px-2 py-0.5 text-[9px] font-bold"
            style={{ backgroundColor: sc, color: tc }}
          >
            {p.status}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-blue-200 bg-blue-50 px-2.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
          >
            Edit
          </Button>
        </div>
      </div>

      <div className="mt-3 text-sm font-bold text-slate-800">{p.name}</div>
      {p.location ? (
        <div className="mt-0.5 text-[11px] text-slate-500">
          <span aria-hidden>📍 </span>
          {p.location}
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <span
          className="px-2 py-0.5 text-[9px] font-bold"
          style={{
            backgroundColor: `${typeColor}22`,
            color: typeColor
          }}
        >
          {p.type}
        </span>
        <span className="bg-blue-50 px-2 py-0.5 text-[9px] font-semibold text-blue-600">
          FY {p.fy ?? '—'}
        </span>
        {p.base_rate != null ? (
          <span className="bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">
            ₹ {formatInr(p.base_rate, { maximumFractionDigits: 0 })}/sq.ft
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {[
          ['Wings', p.wing_count],
          [
            'Parking',
            p.parking_slots != null && p.parking_slots > 0
              ? p.parking_rate != null
                ? `${p.parking_slots} · ₹${formatInr(p.parking_rate, { maximumFractionDigits: 0 })}/slot`
                : String(p.parking_slots)
              : '—'
          ],
          ['Total units', p.unit_count]
        ].map(([label, val]) => (
          <div key={String(label)} className="bg-slate-50 px-2 py-1.5">
            <div className="text-[9px] text-slate-400">{label}</div>
            <div className="text-xs font-bold text-slate-800">{val}</div>
          </div>
        ))}
      </div>

      {p.member_preview.length > 0 ? (
        <div className="mt-3 flex items-center gap-2">
          <div className="flex">
            {p.member_preview.map((u, i) => (
              <span
                key={u.user_id}
                title={u.name || u.user_id}
                className="flex size-[22px] items-center justify-center rounded-full border-2 border-white bg-blue-500 text-[9px] font-bold text-white"
                style={{ marginLeft: i ? -6 : 0, zIndex: 4 - i }}
              >
                {u.initials}
              </span>
            ))}
          </div>
          <span className="text-[10px] text-slate-400">
            {p.member_count} user{p.member_count !== 1 ? 's' : ''}
          </span>
        </div>
      ) : null}

      <div className="mt-2 text-[9px] text-slate-300">
        RERA: {p.rera_no?.trim() ? p.rera_no : '—'}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <Button
          type="button"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          Open
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onInventory();
          }}
        >
          Inventory
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onSettings();
          }}
        >
          Settings
        </Button>
      </div>
    </div>
  );
}
