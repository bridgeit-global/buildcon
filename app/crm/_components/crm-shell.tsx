'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
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
import { useActiveProject } from './use-active-project';
import { ActiveProjectProvider } from './active-project-context';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

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
  const [sectionOpen, setSectionOpen] = useState(getDefaultNavSectionOpen);

  const showRehab =
    !activeProject || activeProject.type?.toLowerCase() !== 'greenfield';

  const flatNav = useMemo(
    () => flattenCrmNav({ showRehab }),
    [showRehab]
  );

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

  const pageHeading = pathname.startsWith('/crm/select-project')
    ? 'Select project'
    : (matchedNav?.pageTitle ?? matchedNav?.label ?? 'BuildCon CRM');

  const isDashboardRoot = pathname === '/crm/dashboard';
  const onSelectProject = pathname.startsWith('/crm/select-project');
  const breadcrumbModule = onSelectProject
    ? 'Select project'
    : (matchedNav?.label ?? pageHeading);

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
      style={{ background: 'var(--crm-canvas, #fcfcfc)' }}
    >
      <div className="flex h-full min-h-0 overflow-hidden">
        <aside
          className={cn(
            'flex shrink-0 flex-col overflow-hidden text-white transition-[width,min-width] duration-200 ease-out',
            sidebarCollapsed ? 'w-[56px] min-w-[56px]' : 'w-[200px] min-w-[200px]'
          )}
          style={{ background: 'var(--crm-sidebar-bg, #0b1327)' }}
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
                <Button
                  onClick={() => setSidebarCollapsed(false)}
                  variant="ghost"
                  size="icon"
                  aria-label="Expand sidebar"
                >
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
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
                <Button
                  onClick={() => setSidebarCollapsed(true)}
                  variant="ghost"
                  size="icon"
                  aria-label="Collapse sidebar"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                </Button>
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
                  <Select
                    value={activeProjectId ?? undefined}
                    onValueChange={setActiveProjectId}
                    disabled={projects.length === 0}
                  >
                    <SelectTrigger
                      className="mt-1.5 h-auto min-h-9 w-full cursor-pointer border border-white/20 bg-white/8 px-2.5 py-2 text-[11px] text-white shadow-none outline-none hover:bg-white/10 focus-visible:border-white/30 focus-visible:ring-2 focus-visible:ring-white/25 disabled:opacity-50 data-[placeholder]:text-white/45 [&_svg]:text-white/55"
                      aria-label="Switch project"
                    >
                      <SelectValue
                        placeholder={
                          projects.length === 0
                            ? 'No accessible projects'
                            : 'Select project'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(60vh,320px)]">
                      {projects.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                          No accessible projects
                        </SelectItem>
                      ) : (
                        projects.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
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
                  const visible = group.items.filter(
                    (i) => i.id !== 'rehab' || showRehab
                  );
                  if (!visible.length) return null;
                  const open = sectionOpen[group.id] ?? true;
                  const isAdmin = group.id === 'admin';
                  return (
                    <Fragment key={group.id}>
                      {isAdmin ? (
                        <div
                          className="mx-0.5 my-2 border-t border-white/15"
                          role="separator"
                          aria-hidden
                        />
                      ) : null}
                      <div className={cn(gi > 0 && !isAdmin ? 'mt-2' : '')}>
                        <button
                          type="button"
                          onClick={() => toggleSection(group.id)}
                          className="flex w-full items-center justify-between gap-1 rounded-md px-1.5 py-1.5 text-left text-[9px] font-extrabold uppercase tracking-widest text-white/40 transition-colors hover:bg-white/5 hover:text-white/55"
                          aria-expanded={open}
                        >
                          <span className="truncate">{group.label}</span>
                          <ChevronDown
                            className={cn(
                              'size-3.5 shrink-0 text-white/35 transition-transform',
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
              'border-t border-white/10 pb-3.5 pt-2.5',
              sidebarCollapsed ? 'px-1.5' : 'px-3.5'
            )}
          >
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--crm-accent,#7f56d9) text-[11px] font-bold text-white"
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
                  className="flex size-7 shrink-0 items-center justify-center rounded-full bg-(--crm-accent,#7f56d9) text-[11px] font-bold text-white"
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
                <span className="text-[#98A2B3]" aria-hidden>
                  /
                </span>
                <span className="max-w-[200px] truncate">
                  {onSelectProject ? 'Select project' : (activeProject?.name ?? '—')}
                </span>
                {!isDashboardRoot && !onSelectProject ? (
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
              <div className="mb-3">
                <h1 className="text-base font-bold leading-snug text-[#101828]">
                  {pageHeading}
                </h1>
                <p className="mt-0.5 text-[11px] text-[#667085]">
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
          ? 'border-l-(--crm-accent,#7f56d9) bg-white/15 font-bold text-white'
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
