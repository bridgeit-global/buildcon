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
import { CrmNotificationBell } from './crm-notification-bell';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar
} from '@/components/ui/sidebar';

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

const sidebarProviderStyle = {
  background: 'var(--crm-canvas, #f8f9fa)',
  '--sidebar-width': '14.5rem',
  '--sidebar-width-icon': '3.5rem'
} as React.CSSProperties;

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

  const flatNav = useMemo(() => flattenCrmNav(), []);

  const matchedNav = useMemo(
    () => matchCrmNavItem(pathname, flatNav),
    [pathname, flatNav]
  );

  const pageHeading = matchedNav?.pageTitle ?? matchedNav?.label ?? 'BuildCon CRM';
  const isDashboardRoot = pathname === '/crm/dashboard';
  const breadcrumbModule = matchedNav?.label ?? pageHeading;

  return (
    <SidebarProvider
      defaultOpen
      className="h-screen overflow-hidden overscroll-none text-[13px]"
      style={sidebarProviderStyle}
    >
      <CrmAppSidebar userEmail={userEmail} pathname={pathname} />
      <SidebarInset className="crm-scrollbar min-h-0 overflow-y-auto overscroll-contain">
        <CrmProjectsProvider value={{ projects }}>
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
            <div className="mb-3 flex items-start justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <SidebarTrigger
                  className="size-9 shrink-0 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 md:hidden"
                  aria-label="Open navigation menu"
                />
                <h1 className="min-w-0 flex-1 text-base font-bold leading-snug text-[#101828] sm:text-lg">
                  {pageHeading}
                </h1>
              </div>
              <CrmNotificationBell />
            </div>
            {children}
          </div>
        </CrmProjectsProvider>
      </SidebarInset>
    </SidebarProvider>
  );
}

function CrmAppSidebar({
  userEmail,
  pathname
}: {
  userEmail: string | null;
  pathname: string;
}) {
  const { state, isMobile, setOpenMobile, toggleSidebar } = useSidebar();
  const iconCollapsed = state === 'collapsed' && !isMobile;

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

  const closeMobileSidebar = () => {
    if (isMobile) setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-slate-200/90 shadow-[1px_0_0_0_rgba(15,23,42,0.04)]">
      <SidebarHeader
        className={cn(
          'border-b border-slate-200/80 pb-3 pt-4',
          iconCollapsed ? 'px-1.5' : 'px-4'
        )}
      >
        {iconCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Building2
              className="size-[18px] shrink-0 text-(--crm-accent,#0d9488)"
              aria-hidden
            />
            <Button
              onClick={toggleSidebar}
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
              onClick={toggleSidebar}
              variant="ghost"
              size="icon"
              className="hidden shrink-0 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 md:inline-flex"
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
          </div>
        )}
      </SidebarHeader>

      <SidebarContent
        className={cn(
          'crm-sidebar-scrollbar py-1',
          iconCollapsed ? 'px-1' : 'px-2.5'
        )}
      >
        {iconCollapsed ? (
          <SidebarMenu>
            {flatNav.map((item) => (
              <CrmSidebarNavItem
                key={item.id}
                href={item.href}
                label={item.label}
                icon={item.icon}
                active={
                  pathname === item.href ||
                  pathname.startsWith(`${item.href}/`)
                }
                tooltip={item.label}
                onNavigate={closeMobileSidebar}
              />
            ))}
          </SidebarMenu>
        ) : (
          CRM_NAV_GROUPS.map((group, gi) => {
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
                    <SidebarMenu className="space-y-px pb-1">
                      {visible.map((item) => (
                        <CrmSidebarNavItem
                          key={item.id}
                          href={item.href}
                          label={item.label}
                          icon={item.icon}
                          active={
                            pathname === item.href ||
                            pathname.startsWith(`${item.href}/`)
                          }
                          onNavigate={closeMobileSidebar}
                        />
                      ))}
                    </SidebarMenu>
                  ) : null}
                </div>
              </Fragment>
            );
          })
        )}
      </SidebarContent>

      <SidebarFooter
        className={cn(
          'border-t border-slate-200/80 pb-3.5 pt-2.5',
          iconCollapsed ? 'px-1.5' : 'px-3.5'
        )}
      >
        {iconCollapsed ? (
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
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function CrmSidebarNavItem({
  href,
  label,
  icon: Icon,
  active,
  tooltip,
  onNavigate
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  tooltip?: string;
  onNavigate?: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={tooltip}
        className={cn(
          'h-auto rounded-lg py-2.5 text-[12px] font-medium text-[#6C757D] hover:bg-slate-200/55 hover:text-slate-900',
          active &&
            'bg-(--crm-accent,#0d9488)! font-semibold text-white! shadow-sm hover:bg-(--crm-accent,#0d9488)! hover:text-white! data-[active=true]:bg-(--crm-accent,#0d9488)! data-[active=true]:text-white!'
        )}
      >
        <Link
          href={href}
          aria-current={active ? 'page' : undefined}
          onClick={onNavigate}
        >
          <Icon
            className={cn(
              'size-4 shrink-0',
              active ? 'text-white' : 'text-[#6C757D] opacity-90'
            )}
            aria-hidden
          />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
