'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  AlertCircle,
  ArrowRight,
  BookmarkCheck,
  CheckCircle2,
  Home,
  Layers,
  Receipt,
  TrendingUp,
  Wallet
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  FIN_TONE_CLASS,
  STAT_ACCENT_CLASS,
  WORKFLOW_BADGE_CLASS,
  type FinTone,
  type StatAccent
} from './dashboard-theme';

export const DASHBOARD_WORKFLOW_STEPS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    sub: 'Overview of project sales, inventory & collections.',
    href: '/crm/dashboard'
  },
  {
    id: 'inventory',
    label: 'Inventory',
    sub: 'Check unit availability and block units.',
    href: '/crm/inventory'
  },
  {
    id: 'bookings',
    label: 'Booking',
    sub: 'Create booking for customer.',
    href: '/crm/bookings'
  },
  {
    id: 'customers',
    label: 'Customer',
    sub: 'Manage customer details & KYC.',
    href: '/crm/customers'
  },
  {
    id: 'financials',
    label: 'Financials',
    sub: 'Payment schedule & collections.',
    href: '/crm/financials'
  },
  {
    id: 'documents',
    label: 'Documents',
    sub: 'Generate agreements & letters.',
    href: '/crm/documents'
  },
  {
    id: 'reports',
    label: 'Reports',
    sub: 'View reports & analytics.',
    href: '/crm/reports'
  }
] as const;

export function ChartPanel({
  title,
  periodLabel = '12 months',
  children,
  className
}: {
  title: string;
  periodLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        'overflow-hidden rounded-xl border border-ds-gray-200 bg-white p-4 shadow-sm sm:p-5',
        className
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold text-ds-gray-800">{title}</h2>
        <span className="shrink-0 text-[11px] font-medium text-ds-primary-600">
          {periodLabel}
        </span>
      </div>
      {children}
    </Card>
  );
}

export function StatCard({
  label,
  value,
  unit,
  sub,
  accent,
  href,
  variant = 'outline',
  icon: Icon
}: {
  label: string;
  value: number | string;
  unit: string;
  sub?: string;
  accent: StatAccent;
  href?: string;
  variant?: 'filled' | 'outline';
  icon: LucideIcon;
}) {
  const filled = variant === 'filled';
  const { icon: iconClass, sub: subClass } = STAT_ACCENT_CLASS[accent];
  const className = cn(
    'min-w-0 flex-1 rounded-xl px-4 py-3.5 shadow-sm transition-shadow',
    filled
      ? 'bg-ds-primary-500 text-white'
      : 'border border-ds-gray-200 bg-white',
    href && !filled && 'cursor-pointer hover:border-ds-primary-200 hover:shadow-md',
    href && filled && 'cursor-pointer hover:bg-ds-primary-600'
  );
  const inner = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <span
          className={cn(
            'text-[11px] font-medium leading-tight',
            filled ? 'text-white/85' : 'text-ds-gray-500'
          )}
        >
          {label}
        </span>
        <Icon
          className={cn('size-[18px] shrink-0', filled ? 'text-white/90' : iconClass)}
          aria-hidden
        />
      </div>
      <div
        className={cn(
          'text-2xl font-bold tracking-tight sm:text-[26px]',
          filled ? 'text-white' : 'text-ds-gray-800'
        )}
      >
        {value}
      </div>
      <div
        className={cn(
          'mt-0.5 text-[11px]',
          filled ? 'text-white/80' : 'text-ds-gray-500'
        )}
      >
        {unit}
      </div>
      {sub ? (
        <div
          className={cn(
            'mt-1 text-[10px] font-semibold',
            filled ? 'text-white/75' : subClass
          )}
        >
          {sub}
        </div>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}

const FIN_ICONS: Record<FinTone, LucideIcon> = {
  primary: TrendingUp,
  success: Wallet,
  warning: Receipt,
  destructive: AlertCircle
};

export function FinCard({
  label,
  valueCr,
  sub,
  tone,
  href
}: {
  label: string;
  valueCr: string;
  sub: string;
  tone: FinTone;
  href?: string;
}) {
  const Icon = FIN_ICONS[tone];
  const { value, icon } = FIN_TONE_CLASS[tone];
  const className = cn(
    'min-w-0 flex-1 rounded-xl border border-ds-gray-200 bg-white px-4 py-3.5 shadow-sm transition-shadow',
    href && 'cursor-pointer hover:border-ds-primary-200 hover:shadow-md'
  );
  const inner = (
    <>
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium leading-tight text-ds-gray-500">
          {label}
        </span>
        <Icon className={cn('size-[18px] shrink-0', icon)} aria-hidden />
      </div>
      <div className={cn('text-xl font-bold tracking-tight sm:text-2xl', value)}>
        ₹ {valueCr} Cr
      </div>
      <div className="mt-1 text-[10px] text-ds-gray-400">{sub}</div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}

export function DashboardWorkflowCta() {
  const firstStep = DASHBOARD_WORKFLOW_STEPS[1];

  return (
    <Card className="relative overflow-hidden rounded-xl border-0 bg-ds-primary-500 p-4 text-white shadow-sm sm:p-5">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.35) 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
        aria-hidden
      />
      <div className="relative">
        <p className="text-sm font-semibold">Project workflow</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-white/85">
          Move from inventory to booking, financials, and reports in a few clicks.
        </p>
        <Link
          href={firstStep.href}
          className="mt-3 inline-flex min-h-9 items-center gap-1 text-[11px] font-semibold text-white underline-offset-2 hover:underline"
        >
          Open inventory
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Card>
  );
}

export function DashboardWorkflowNav() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {DASHBOARD_WORKFLOW_STEPS.map((step, i) => (
        <Link
          key={step.id}
          href={step.href}
          className="min-w-[88px] flex-1 rounded-xl border border-ds-gray-200 bg-white px-2.5 py-2.5 text-left transition-shadow hover:border-ds-primary-200 hover:shadow-md"
        >
          <div
            className={cn(
              'mb-1 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold',
              WORKFLOW_BADGE_CLASS[i % WORKFLOW_BADGE_CLASS.length]
            )}
          >
            {i + 1}
          </div>
          <div className="text-[11px] font-semibold text-ds-gray-800">{step.label}</div>
          <div className="mt-0.5 text-[9px] leading-snug text-ds-gray-400">{step.sub}</div>
        </Link>
      ))}
    </div>
  );
}

export const STAT_CARD_ICONS = {
  inventory: Layers,
  booked: BookmarkCheck,
  sold: CheckCircle2,
  available: Home
} as const;
