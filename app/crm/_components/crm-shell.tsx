'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  LogOut
} from 'lucide-react';
import { CRM_NAV } from './nav';
import type { CrmProject } from './types';
import { useActiveProject } from './use-active-project';
import { ActiveProjectProvider } from './active-project-context';
import { cn } from '@/lib/utils';

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
  const router = useRouter();
  const pathname = usePathname();
  const { activeProject, activeProjectId, setActiveProjectId, hydrated } =
    useActiveProject(projects);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const showRehab =
    !activeProject || activeProject.type?.toLowerCase() !== 'greenfield';

  const navItems = useMemo(
    () =>
      CRM_NAV.filter((i) => (showRehab ? true : i.id !== 'rehab')).map(
        (item) => ({
          ...item,
          showAdminDivider: item.id === 'users'
        })
      ),
    [showRehab]
  );

  const matchedNav = CRM_NAV.find(
    (n) => pathname === n.href || pathname.startsWith(`${n.href}/`)
  );
  const pageHeading =
    matchedNav?.pageTitle ?? matchedNav?.label ?? 'BuildCon CRM';

  useEffect(() => {
    if (!hydrated) return;
    if (activeProjectId) return;
    if (pathname.startsWith('/crm/select-project')) return;
    if (projects.length === 0) {
      router.replace('/crm/select-project');
      return;
    }
    router.replace('/crm/select-project');
  }, [hydrated, projects.length, activeProjectId, pathname, router]);

  return (
    <div
      className="h-screen overflow-hidden overscroll-none text-[13px]"
      style={{ background: 'var(--crm-canvas, #f1f5f9)' }}
    >
      <div className="flex h-full min-h-0 overflow-hidden">
        <aside
          className={cn(
            'flex shrink-0 flex-col overflow-hidden text-white transition-[width,min-width] duration-200 ease-out',
            sidebarCollapsed ? 'w-[56px] min-w-[56px]' : 'w-[200px] min-w-[200px]'
          )}
          style={{ background: 'var(--crm-sidebar-bg, #1b2b65)' }}
        >
          <div
            className={cn(
              'border-b border-white/10 pb-3 pt-4',
              sidebarCollapsed ? 'px-1.5' : 'px-4'
            )}
          >
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <Building2
                  className="size-[18px] shrink-0 text-white/90"
                  aria-hidden
                />
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(false)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  aria-expanded={false}
                  aria-label="Expand sidebar"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </button>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[15px] font-bold tracking-wide">
                    <Building2
                      className="size-4 shrink-0 text-white/90"
                      aria-hidden
                    />
                    BuildCon
                  </div>
                  <div className="mt-0.5 text-[10px] font-normal uppercase tracking-[0.08em] text-white/40">
                    Redevelopment CRM
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarCollapsed(true)}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  aria-expanded
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </button>
              </div>
            )}
          </div>

          <div
            className={cn(
              'border-b border-white/10 pb-2 pt-2',
              sidebarCollapsed ? 'px-1.5' : 'px-2.5'
            )}
          >
            {sidebarCollapsed ? (
              <Link
                href="/crm/select-project"
                className="flex flex-col items-center gap-1 rounded-md bg-white/12 px-1 py-2 text-white/85 transition-colors hover:bg-white/18 hover:text-white"
                title={`${activeProject?.name ?? 'Project'} · FY ${activeProject?.fy ?? '—'}`}
              >
                <Building2 className="size-[18px] shrink-0" aria-hidden />
                <span className="sr-only">Switch active project</span>
                <span className="max-w-full truncate text-[9px] font-semibold tabular-nums leading-none text-white/55">
                  FY {activeProject?.fy ?? '—'}
                </span>
              </Link>
            ) : (
              <>
                <div className="px-1.5 pb-1 text-[9px] font-semibold uppercase tracking-widest text-white/40">
                  Active project
                </div>
                <div className="rounded-md bg-white/12 px-2.5 py-2">
                  <div className="mt-0.5 text-[9px] text-white/40">
                    FY {activeProject?.fy ?? '—'}
                  </div>
                  <select
                    value={activeProjectId ?? ''}
                    onChange={(e) => setActiveProjectId(e.target.value)}
                    className="mt-1.5 w-full cursor-pointer border border-white/20 bg-white/8 px-2.5 py-2 text-[11px] text-white outline-none focus-visible:ring-2 focus-visible:ring-sky-300/80 disabled:opacity-50"
                    disabled={projects.length === 0}
                    aria-label="Switch project"
                  >
                    {projects.length === 0 ? (
                      <option value="">No accessible projects</option>
                    ) : null}
                    {projects.map((p) => (
                      <option key={p.id} value={p.id} className="text-slate-800">
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
          </div>

          <nav
            className={cn(
              'crm-sidebar-scrollbar flex-1 overflow-y-auto py-1',
              sidebarCollapsed ? 'px-1' : 'px-2.5'
            )}
            aria-label="Main navigation"
          >
            {navItems.map((item) => (
              <Fragment key={item.id}>
                {item.showAdminDivider ? (
                  sidebarCollapsed ? (
                    <div
                      className="mx-0.5 my-2 border-t border-white/15"
                      role="separator"
                      aria-hidden
                    />
                  ) : (
                    <div className="px-1.5 pb-1.5 pt-2.5 text-[9px] font-extrabold uppercase tracking-widest text-white/35">
                      Admin
                    </div>
                  )
                ) : null}
                <CrmNavLink
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  collapsed={sidebarCollapsed}
                  active={
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`)
                  }
                />
              </Fragment>
            ))}
          </nav>

          <div
            className={cn(
              'border-t border-white/10 pb-3.5 pt-2.5',
              sidebarCollapsed ? 'px-1.5' : 'px-3.5'
            )}
          >
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#3b82f6] text-[11px] font-bold text-white"
                  title={userEmail ?? 'Signed out'}
                >
                  {initialsFromEmail(userEmail)}
                </div>
                <Link
                  href="/logout"
                  className="rounded-md p-1.5 text-white/45 transition-colors hover:bg-white/10 hover:text-white/80"
                  title="Sign out"
                >
                  <LogOut className="size-4" aria-hidden />
                  <span className="sr-only">Sign out</span>
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#3b82f6] text-[11px] font-bold text-white"
                  aria-hidden="true"
                >
                  {initialsFromEmail(userEmail)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[11px] font-semibold text-white">
                    {userEmail ?? 'Signed out'}
                  </div>
                  <Link
                    href="/logout"
                    className="text-[10px] text-white/45 transition-colors hover:text-white/80"
                  >
                    Sign out
                  </Link>
                </div>
              </div>
            )}
          </div>
        </aside>

        <ActiveProjectProvider
          value={{ projects, activeProjectId, activeProject, setActiveProjectId }}
        >
          <main className="crm-scrollbar min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="p-4">
              <div className="mb-3">
                <h1 className="text-base font-bold leading-snug text-[#1e293b]">
                  {pageHeading}
                </h1>
                <p className="mt-0.5 text-[11px] text-[#94a3b8]">
                  {activeProject?.name ?? '—'} · FY {activeProject?.fy ?? '—'}
                </p>
              </div>
              {children}
            </div>
          </main>
        </ActiveProjectProvider>
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
        'mb-px flex w-full items-center rounded-md border-l-[3px] text-left text-[12px] transition-colors',
        collapsed
          ? 'justify-center px-0 py-2.5'
          : 'gap-2 py-2 pl-2.5 pr-2',
        active
          ? 'border-l-sky-400 bg-white/15 font-bold text-white'
          : 'border-l-transparent font-medium text-white/60 hover:bg-white/10 hover:text-white'
      )}
    >
      <Icon
        className={cn(
          'shrink-0 opacity-95',
          collapsed ? 'size-[18px]' : 'size-4'
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
