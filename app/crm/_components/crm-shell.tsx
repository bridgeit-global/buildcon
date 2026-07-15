'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent
} from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Search,
  UserRound
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
import { useCrmProjectsStore } from '@/store/crm-projects-store';
import { CrmNotificationBell } from './crm-notification-bell';
import { ThemeSwitcher } from '@/components/theme-switcher';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
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

function initialsFromLabel(label: string | null) {
  if (!label) return '?';
  const source = label.includes('@') ? (label.split('@')[0] ?? '') : label;
  const cleaned = source.replace(/[._-]+/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  const compact = source.replace(/[^a-zA-Z0-9]/g, '');
  if (compact.length >= 2) return compact.slice(0, 2).toUpperCase();
  return compact.slice(0, 1).toUpperCase() || '?';
}

const sidebarProviderStyle = {
  background: 'var(--crm-canvas)',
  '--sidebar-width': '14.5rem',
  '--sidebar-width-icon': '3.5rem'
} as React.CSSProperties;

export function CrmShell({
  userEmail,
  userName,
  projects,
  children
}: {
  userEmail: string | null;
  userName: string | null;
  projects: CrmProject[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const setProjects = useCrmProjectsStore((s) => s.setProjects);

  const flatNav = useMemo(() => flattenCrmNav(), []);

  const matchedNav = useMemo(
    () => matchCrmNavItem(pathname, flatNav),
    [pathname, flatNav]
  );

  const pageHeading = matchedNav?.pageTitle ?? matchedNav?.label ?? 'BuildCon CRM';
  const isDashboardRoot = pathname === '/crm/dashboard';
  const breadcrumbModule = matchedNav?.label ?? pageHeading;

  useEffect(() => {
    setProjects(projects);
  }, [projects, setProjects]);

  return (
    <SidebarProvider
      defaultOpen
      className="h-screen overflow-hidden overscroll-none text-[13px]"
      style={sidebarProviderStyle}
    >
      <CrmAppSidebar userEmail={userEmail} pathname={pathname} />
      <SidebarInset className="crm-scrollbar min-h-0 overflow-y-auto overscroll-contain">
        <header className="sticky top-0 z-20 border-b border-border/80 bg-card/95 shadow-sm backdrop-blur-md supports-backdrop-filter:bg-card/80">
          <div className="flex flex-col gap-3 px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <SidebarTrigger
                className="size-9 shrink-0 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground md:hidden"
                aria-label="Open navigation menu"
              />
              <nav
                className="min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground hidden sm:flex"
                aria-label="Breadcrumb"
              >
                <Link
                  href="/crm/dashboard"
                  className="font-medium text-ds-gray-600 underline-offset-2 transition-colors duration-150 hover:text-foreground hover:underline"
                >
                  Dashboard
                </Link>
                {!isDashboardRoot ? (
                  <>
                    <span className="text-ds-gray-400" aria-hidden>
                      /
                    </span>
                    <span className="max-w-[220px] truncate font-medium text-foreground">
                      {breadcrumbModule}
                    </span>
                  </>
                ) : null}
              </nav>
              <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                <CrmNavSearch navItems={flatNav} />
                <CrmNotificationBell />
                <ThemeSwitcher compact />
                <CrmUserMenu userEmail={userEmail} userName={userName} />
              </div>
            </div>
            <nav
              className="min-w-0 truncate text-[11px] text-muted-foreground sm:hidden"
              aria-label="Breadcrumb"
            >
              <Link
                href="/crm/dashboard"
                className="font-medium text-ds-gray-600"
              >
                Dashboard
              </Link>
              {!isDashboardRoot ? (
                <span className="text-foreground">
                  {' '}
                  / {breadcrumbModule}
                </span>
              ) : null}
            </nav>
            <h1 className="min-w-0 text-base font-bold leading-snug text-foreground sm:text-lg">
              {pageHeading}
            </h1>
          </div>
        </header>
        <div className="p-4 sm:p-5">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function CrmNavSearch({
  navItems
}: {
  navItems: ReturnType<typeof flattenCrmNav>;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return navItems.slice(0, 8);
    return navItems
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          (item.pageTitle?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 8);
  }, [navItems, query]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const goTo = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (results[0]) goTo(results[0].href);
  };

  return (
    <div ref={rootRef} className="relative hidden md:block">
      <form onSubmit={onSubmit} className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search pages…"
          className="h-9 w-44 rounded-xl border-border bg-background pl-8 text-xs shadow-sm transition-[width,box-shadow] duration-150 focus-visible:w-56 lg:w-52 lg:focus-visible:w-64"
          aria-label="Search CRM pages"
          aria-expanded={open}
          aria-controls="crm-nav-search-results"
          autoComplete="off"
        />
      </form>
      {open ? (
        <ul
          id="crm-nav-search-results"
          role="listbox"
          className="absolute top-[calc(100%+6px)] right-0 z-30 w-64 overflow-hidden rounded-xl border border-border bg-popover py-1 shadow-md"
        >
          {results.length === 0 ? (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              No matching pages
            </li>
          ) : (
            results.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id} role="option">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors duration-150 hover:bg-accent hover:text-accent-foreground"
                    onClick={() => goTo(item.href)}
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate font-medium">
                      {item.label}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

function CrmUserMenu({
  userEmail,
  userName
}: {
  userEmail: string | null;
  userName: string | null;
}) {
  const displayName = userName || userEmail || 'Account';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-9 gap-2 rounded-xl border-border bg-card px-2 shadow-sm transition-colors duration-150"
          aria-label="User menu"
        >
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
            {initialsFromLabel(userName || userEmail)}
          </span>
          <span className="hidden max-w-[120px] truncate text-xs font-medium lg:inline">
            {displayName}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-2">
            <UserRound className="size-4 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {userName || userEmail || 'Signed out'}
              </p>
              {userName && userEmail ? (
                <p className="truncate text-[11px] text-muted-foreground">
                  {userEmail}
                </p>
              ) : (
                <p className="text-[11px] text-muted-foreground">CRM account</p>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild variant="destructive">
          <Link href="/logout" className="cursor-pointer">
            <LogOut className="size-4" aria-hidden />
            Sign out
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
  const [brandName, setBrandName] = useState('BuildCon');
  const [brandLogoUrl, setBrandLogoUrl] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/crm/organization');
        if (!res.ok) return;
        const json = (await res.json()) as {
          organization?: { trade_name?: string | null };
          logoUrl?: string | null;
        };
        if (cancelled) return;
        const name = String(json.organization?.trade_name ?? '').trim();
        if (name) setBrandName(name);
        setBrandLogoUrl(json.logoUrl ?? null);
      } catch {
        /* keep defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
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
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border shadow-[1px_0_0_0_rgba(0,0,0,0.12)]"
    >
      <SidebarHeader
        className={cn(
          'border-b border-sidebar-border pb-3 pt-4',
          iconCollapsed ? 'px-1.5' : 'px-4'
        )}
      >
        {iconCollapsed ? (
          <div className="flex flex-col items-center gap-2">
            {brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={brandLogoUrl}
                alt={brandName}
                className="size-7 shrink-0 rounded-md object-contain"
              />
            ) : (
              <Building2
                className="size-[18px] shrink-0 text-sidebar-primary"
                aria-hidden
              />
            )}
            <Button
              onClick={toggleSidebar}
              variant="ghost"
              size="icon"
              className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              aria-label="Expand sidebar"
            >
              <ChevronRight className="size-4" aria-hidden />
            </Button>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-col items-start gap-1.5">
                {brandLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={brandLogoUrl}
                    alt=""
                    className="h-8 w-auto max-w-full rounded-md object-contain"
                  />
                ) : (
                  <Building2
                    className="size-4 shrink-0 text-sidebar-primary"
                    aria-hidden
                  />
                )}
                <div className="min-w-0 text-[15px] font-bold tracking-tight text-sidebar-foreground">
                  <span className="block truncate">{brandName}</span>
                </div>
              </div>
              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-sidebar-foreground/55">
                Redevelopment CRM
              </div>
            </div>
            <Button
              onClick={toggleSidebar}
              variant="ghost"
              size="icon"
              className="hidden shrink-0 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:inline-flex"
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
          <SidebarMenu className="items-center gap-0.5 px-0">
            {flatNav.map((item) => (
              <CrmSidebarNavItem
                key={item.id}
                href={item.href}
                label={item.label}
                icon={item.icon}
                iconOnly
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
                    className="mx-0.5 my-2 border-t border-sidebar-border"
                    role="separator"
                    aria-hidden
                  />
                ) : null}
                <div className={cn(gi > 0 && !isAdmin ? 'mt-2' : '')}>
                  <button
                    type="button"
                    onClick={() => toggleSection(group.id)}
                    className="flex w-full min-h-9 items-center justify-between gap-1 rounded-lg px-1.5 py-2 text-left text-[9px] font-extrabold uppercase tracking-widest text-sidebar-foreground/50 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-foreground/80"
                    aria-expanded={open}
                  >
                    <span className="truncate">{group.label}</span>
                    <ChevronDown
                      className={cn(
                        'size-3.5 shrink-0 text-sidebar-foreground/40 transition-transform duration-150',
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
      <SidebarRail />
    </Sidebar>
  );
}

function CrmSidebarNavItem({
  href,
  label,
  icon: Icon,
  active,
  iconOnly = false,
  tooltip,
  onNavigate
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  iconOnly?: boolean;
  tooltip?: string;
  onNavigate?: () => void;
}) {
  return (
    <SidebarMenuItem className={iconOnly ? 'w-full' : undefined}>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={tooltip}
        className={cn(
          'text-[12px] font-medium text-sidebar-foreground/65 transition-colors duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          iconOnly
            ? 'mx-auto size-10 justify-center gap-0 rounded-lg p-0 [&>a>span]:sr-only'
            : 'h-auto gap-2.5 rounded-lg px-2.5 py-2.5',
          active &&
            'bg-sidebar-primary! font-semibold text-sidebar-primary-foreground! shadow-sm hover:bg-sidebar-primary! hover:text-sidebar-primary-foreground! data-[active=true]:bg-sidebar-primary! data-[active=true]:text-sidebar-primary-foreground!'
        )}
      >
        <Link
          href={href}
          aria-current={active ? 'page' : undefined}
          onClick={onNavigate}
          className={iconOnly ? 'flex size-full items-center justify-center' : undefined}
        >
          <Icon
            className={cn(
              'shrink-0',
              iconOnly ? 'size-[18px]' : 'size-4',
              active
                ? 'text-sidebar-primary-foreground'
                : 'text-sidebar-foreground/65 opacity-90'
            )}
            aria-hidden
          />
          <span>{label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
