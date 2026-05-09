'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo } from 'react';
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
      className="min-h-screen overflow-hidden text-[13px]"
      style={{ background: 'var(--crm-canvas, #f1f5f9)' }}
    >
      <div className="flex h-screen overflow-hidden">
        <aside
          className="flex w-[200px] min-w-[200px] shrink-0 flex-col overflow-hidden text-white"
          style={{ background: 'var(--crm-sidebar-bg, #1b2b65)' }}
        >
          <div className="border-b border-white/10 px-4 pb-3 pt-4">
            <div className="text-[15px] font-bold tracking-wide">
              <span aria-hidden="true">🏢 </span>BuildCon
            </div>
            <div className="mt-0.5 text-[10px] font-normal uppercase tracking-[0.08em] text-white/40">
              Redevelopment CRM
            </div>
          </div>

          <div className="border-b border-white/10 px-2.5 pb-2 pt-2">
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
          </div>

          <nav
            className="crm-scrollbar flex-1 overflow-y-auto px-2.5 py-1"
            aria-label="Main navigation"
          >
            {navItems.map((item) => (
              <Fragment key={item.id}>
                {item.showAdminDivider ? (
                  <div className="px-1.5 pb-1.5 pt-2.5 text-[9px] font-extrabold uppercase tracking-widest text-white/35">
                    Admin
                  </div>
                ) : null}
                <CrmNavLink
                  href={item.href}
                  label={item.label}
                  emoji={item.emoji}
                  active={
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`)
                  }
                />
              </Fragment>
            ))}
          </nav>

          <div className="border-t border-white/10 px-3.5 pb-3.5 pt-2.5">
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
          </div>
        </aside>

        <ActiveProjectProvider
          value={{ projects, activeProjectId, activeProject, setActiveProjectId }}
        >
          <main className="crm-scrollbar flex-1 overflow-y-auto">
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
  emoji,
  active
}: {
  href: string;
  label: string;
  emoji: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'mb-px flex w-full items-center gap-2 rounded-md border-l-[3px] py-2 pl-2.5 pr-2 text-left text-[12px] transition-colors',
        active
          ? 'border-l-sky-400 bg-white/15 font-bold text-white'
          : 'border-l-transparent font-medium text-white/60 hover:bg-white/10 hover:text-white'
      )}
    >
      <span className="w-4 text-center text-[13px]" aria-hidden="true">
        {emoji}
      </span>
      {label}
    </Link>
  );
}
