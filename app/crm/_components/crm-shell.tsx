'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut
} from 'lucide-react';
import {
  CRM_NAV_GROUPS,
  flattenCrmNav,
  getDefaultNavSectionOpen,
  matchCrmNavItem,
  persistNavSectionOpen,
  readNavSectionOpenFromStorage
} from './nav';
import type { CrmProject } from './types';
import { CrmProjectsProvider } from './active-project-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

function initialsFromEmail(email: string | null) {
  if (!email) return '?';
  const local = email.split('@')[0] ?? '';
  const cleaned = local.replace(/[._-]+/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const compact = local.replace(/[^a-zA-Z0-9]/g, '');
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  return compact.slice(0, 1).toUpperCase() || '?';
}

export function CrmShell({
  userEmail,
  projects,
  children
}: {
  userEmail: string | null;
  projects: CrmProject[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sectionOpen, setSectionOpen] = useState(getDefaultNavSectionOpen);

  const flatNav = useMemo(() => flattenCrmNav(), []);

  useEffect(() => {
    const stored = readNavSectionOpenFromStorage();
    if (!stored) return;
    setSectionOpen((prev) => {
      const next = { ...prev };
      for (const g of CRM_NAV_GROUPS) {
        if (typeof stored[g.id] === 'boolean') next[g.id] = stored[g.id]!;
      }
      return next;
    });
  }, []);

  const toggleSection = (groupId: string) => {
    setSectionOpen((prev) => {
      const next = { ...prev, [groupId]: !prev[groupId] };
      persistNavSectionOpen(next);
      return next;
    });
  };

  const matchedNav = useMemo(
    () => matchCrmNavItem(pathname, flatNav),
    [pathname, flatNav]
  );

  const pageHeading = matchedNav?.pageTitle ?? matchedNav?.label ?? 'BuildCon CRM';
  const isDashboardRoot = pathname === '/crm/dashboard';
  const breadcrumbModule = matchedNav?.label ?? pageHeading;

  return (
    <div
      className="h-screen overflow-hidden overscroll-none text-[13px]"
      style={{ background: 'var(--crm-canvas, #f8f9fa)' }}
    >
      <div className="flex h-full min-h-0 overflow-hidden">
        <aside
          className={cn(
            'flex shrink-0 flex-col overflow-hidden border-r border-slate-200/90 text-slate-700 shadow-[1px_0_0_0_rgba(15,23,42,0.04)] transition-[width,min-width] duration-200 ease-out',
            sidebarCollapsed ? 'w-[56px] min-w-[56px]' : 'w-[220px] min-w-[220px] sm:w-[232px] sm:min-w-[232px]'
          )}
          style={{ background: 'var(--crm-sidebar-bg, #eef1f4)' }}
        >
          <div
            className={cn(
              'border-b border-slate-200/80 pb-3 pt-4',
              sidebarCollapsed ? 'px-1.5' : 'px-4'
            )}
          >
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <Building2
                  className="size-[18px] shrink-0 text-(--crm-accent,#0d9488)"
                  aria-hidden
                />
                <Button
                  onClick={() => setSidebarCollapsed(false)}
                  variant="ghost"
                  size="icon"
                  className="text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                  aria-label="Expand sidebar"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-slate-900">
                    <Building2
                      className="size-4 shrink-0 text-(--crm-accent,#0d9488)"
                      aria-hidden
                    />
                    BuildCon
                  </div>
                  <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">
                    Redevelopment CRM
                  </div>
                </div>
                <Button
                  onClick={() => setSidebarCollapsed(true)}
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900"
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
              </div>
            )}
          </div>

          <nav
            className={cn(
              'crm-sidebar-scrollbar flex-1 overflow-y-auto py-1',
              sidebarCollapsed ? 'px-1' : 'px-2.5'
            )}
            aria-label="Main navigation"
          >
            {sidebarCollapsed
              ? flatNav.map((item) => (
                <CrmNavLink
                  key={item.id}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  collapsed
                  active={
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`)
                  }
                />
              ))
              : CRM_NAV_GROUPS.map((group, gi) => {
                const visible = group.items;
                if (!visible.length) return null;
                const open = sectionOpen[group.id] ?? true;
                const isAdmin = group.id === 'admin';
                return (
                  <Fragment key={group.id}>
                    {isAdmin ? (
                      <div
                        className="mx-0.5 my-2 border-t border-slate-200/90"
                        role="separator"
                        aria-hidden
                      />
                    ) : null}
                    <div className={cn(gi > 0 && !isAdmin ? 'mt-2' : '')}>
                      <button
                        type="button"
                        onClick={() => toggleSection(group.id)}
                        className="flex w-full min-h-9 items-center justify-between gap-1 rounded-lg px-1.5 py-2 text-left text-[9px] font-extrabold uppercase tracking-widest text-slate-500 transition-colors hover:bg-slate-200/50 hover:text-slate-700"
                        aria-expanded={open}
                      >
                        <span className="truncate">{group.label}</span>
                        <ChevronDown
                          className={cn(
                            'size-3.5 shrink-0 text-slate-400 transition-transform',
                            open ? 'rotate-0' : '-rotate-90'
                          )}
                          aria-hidden
                        />
                      </button>
                      {open ? (
                        <div className="space-y-px pb-1">
                          {visible.map((item) => (
                            <CrmNavLink
                              key={item.id}
                              href={item.href}
                              label={item.label}
                              icon={item.icon}
                              collapsed={false}
                              active={
                                pathname === item.href ||
                                pathname.startsWith(`${item.href}/`)
                              }
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </Fragment>
                );
              })}
          </nav>

          <div
            className={cn(
              'border-t border-slate-200/80 pb-3.5 pt-2.5',
              sidebarCollapsed ? 'px-1.5' : 'px-3.5'
            )}
          >
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-(--crm-accent,#0d9488) text-[11px] font-bold text-white shadow-sm"
                  title={userEmail ?? 'Signed out'}
                >
                  {initialsFromEmail(userEmail)}
                </div>
                <Link
                  href="/logout"
                  className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-800"
                  title="Sign out"
                >
                  <LogOut className="size-4" aria-hidden />
                  <span className="sr-only">Sign out</span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2.5">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-full bg-(--crm-accent,#0d9488) text-[11px] font-bold text-white shadow-sm"
                  aria-hidden="true"
                >
                  {initialsFromEmail(userEmail)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-slate-900">
                    {userEmail ?? 'Signed out'}
                  </div>
                  <Link
                    href="/logout"
                    className="mt-0.5 inline-block text-[10px] font-medium text-(--crm-accent,#0d9488) underline-offset-2 hover:underline"
                  >
                    Sign out
                  </Link>
                </div>
              </div>
            )}
          </div>
        </aside>

        <CrmProjectsProvider value={{ projects }}>
          <main className="crm-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="p-4">
              <nav
                className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-[#667085]"
                aria-label="Breadcrumb"
              >
                <Link
                  href="/crm/dashboard"
                  className="font-medium text-[#475467] underline-offset-2 hover:text-[#101828] hover:underline"
                >
                  Dashboard
                </Link>
                {!isDashboardRoot ? (
                  <>
                    <span className="text-[#98A2B3]" aria-hidden>
                      /
                    </span>
                    <span className="max-w-[220px] truncate font-medium text-[#101828]">
                      {breadcrumbModule}
                    </span>
                  </>
                ) : null}
              </nav>
              <h1 className="mb-3 text-base font-bold leading-snug text-[#101828] sm:text-lg">
                {pageHeading}
              </h1>
              {children}
            </div>
          </main>
        </CrmProjectsProvider>
      </div>
    </div>
  );
}

function CrmNavLink({
  href,
  label,
  icon: Icon,
  collapsed,
  active
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  collapsed: boolean;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        'mb-0.5 flex w-full items-center rounded-lg text-left text-[12px] transition-colors',
        collapsed ? 'justify-center px-0 py-2.5' : 'gap-2.5 px-2.5 py-2.5',
        active
          ? 'bg-(--crm-accent,#0d9488) font-semibold text-white shadow-sm'
          : 'group font-medium text-[#6C757D] hover:bg-slate-200/55 hover:text-slate-900'
      )}
    >
      <Icon
        className={cn(
          'shrink-0',
          collapsed ? 'size-[18px]' : 'size-4',
          active ? 'text-white' : 'text-[#6C757D] opacity-90 group-hover:text-slate-900'
        )}
        aria-hidden
      />
      {collapsed ? (
        <span className="sr-only">{label}</span>
      ) : (
        label
      )}
    </Link>
  );
}
