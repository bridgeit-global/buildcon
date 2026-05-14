import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Briefcase,
  Building2,
  Factory,
  FileSpreadsheet,
  FileText,
  Gauge,
  HandCoins,
  Home,
  KeyRound,
  KeySquare,
  LayoutGrid,
  ListTodo,
  MessageCircle,
  Shield,
  Users
} from 'lucide-react';

export type CrmNavItemId =
  | 'dashboard'
  | 'work'
  | 'project'
  | 'inventory'
  | 'bookings'
  | 'inquiry'
  | 'customers'
  | 'brokers'
  | 'financials'
  | 'quotations'
  | 'documents'
  | 'cld'
  | 'possession'
  | 'reports'
  | 'bankloans'
  | 'users';

export type CrmNavItem = {
  id: CrmNavItemId;
  /** Long title in main header */
  pageTitle?: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export type CrmNavGroup = {
  id:
    | 'overview'
    | 'acquire'
    | 'projectStock'
    | 'dealDesk'
    | 'moneyConstruction'
    | 'more'
    | 'admin';
  label: string;
  /** If true, sidebar section starts collapsed until user expands */
  defaultCollapsed?: boolean;
  items: CrmNavItem[];
};

export const CRM_NAV_GROUPS: CrmNavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      {
        id: 'dashboard',
        pageTitle: 'Dashboard – Overview',
        label: 'Dashboard',
        href: '/crm/dashboard',
        icon: Gauge
      },
      {
        id: 'work',
        pageTitle: 'Work queue – Follow-ups & demands',
        label: 'Work queue',
        href: '/crm/work',
        icon: ListTodo
      }
    ]
  },
  {
    id: 'acquire',
    label: 'Acquire & qualify',
    items: [
      {
        id: 'inquiry',
        pageTitle: 'Leads & pipeline',
        label: 'Leads & pipeline',
        href: '/crm/inquiry',
        icon: MessageCircle
      },
      {
        id: 'brokers',
        label: 'Brokers',
        href: '/crm/brokers',
        icon: Briefcase
      },
      {
        id: 'customers',
        label: 'Customers',
        href: '/crm/customers',
        icon: Users
      }
    ]
  },
  {
    id: 'projectStock',
    label: 'Project & stock',
    items: [
      {
        id: 'project',
        pageTitle: 'Project',
        label: 'Project',
        href: '/crm/project',
        icon: Building2
      },
      {
        id: 'inventory',
        pageTitle: 'Inventory – Unit matrix & list',
        label: 'Inventory',
        href: '/crm/inventory',
        icon: LayoutGrid
      }
    ]
  },
  {
    id: 'dealDesk',
    label: 'Deal desk',
    items: [
      {
        id: 'quotations',
        pageTitle: 'Quotations',
        label: 'Quotations',
        href: '/crm/quotations',
        icon: FileSpreadsheet
      },
      {
        id: 'bookings',
        label: 'Bookings',
        href: '/crm/bookings',
        icon: Home
      },
      {
        id: 'documents',
        pageTitle: 'Agreements & documents',
        label: 'Documents',
        href: '/crm/documents',
        icon: FileText
      }
    ]
  },
  {
    id: 'moneyConstruction',
    label: 'Money & construction',
    items: [
      {
        id: 'financials',
        pageTitle: 'Collections & accounts',
        label: 'Financials',
        href: '/crm/financials',
        icon: HandCoins
      },
      {
        id: 'cld',
        pageTitle: 'Construction-linked demand',
        label: 'CLD',
        href: '/crm/cld',
        icon: Factory
      },
      {
        id: 'possession',
        pageTitle: 'Possession & handover',
        label: 'Possession',
        href: '/crm/possession',
        icon: KeyRound
      }
    ]
  },
  {
    id: 'more',
    label: 'More',
    defaultCollapsed: true,
    items: [
      {
        id: 'reports',
        label: 'Reports',
        href: '/crm/reports',
        icon: BarChart3
      },
      {
        id: 'bankloans',
        pageTitle: 'Bank & loans',
        label: 'Bank & loans',
        href: '/crm/bankloans',
        icon: KeySquare
      }
    ]
  },
  {
    id: 'admin',
    label: 'Admin',
    items: [
      {
        id: 'users',
        pageTitle: 'Users (Admin)',
        label: 'Users & access',
        href: '/crm/users',
        icon: Shield
      }
    ]
  }
];

export const CRM_NAV_SECTION_STORAGE_KEY = 'buildcon_crm_nav_section_open_v1';

export function readNavSectionOpenFromStorage(): Record<string, boolean> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(CRM_NAV_SECTION_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, boolean>;
    return typeof o === 'object' && o !== null ? o : null;
  } catch {
    return null;
  }
}

export function getDefaultNavSectionOpen(): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const g of CRM_NAV_GROUPS) {
    next[g.id] = !g.defaultCollapsed;
  }
  return next;
}

export function persistNavSectionOpen(map: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      CRM_NAV_SECTION_STORAGE_KEY,
      JSON.stringify(map)
    );
  } catch {
    /* ignore */
  }
}

export function flattenCrmNav(): CrmNavItem[] {
  const out: CrmNavItem[] = [];
  for (const g of CRM_NAV_GROUPS) {
    for (const item of g.items) {
      out.push(item);
    }
  }
  return out;
}

/** Longest-prefix match for active route (e.g. `/crm/project/create` → project) */
export function matchCrmNavItem(
  pathname: string,
  items: CrmNavItem[]
): CrmNavItem | null {
  let best: CrmNavItem | null = null;
  let bestLen = -1;
  for (const item of items) {
    const { href } = item;
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (href.length > bestLen) {
        bestLen = href.length;
        best = item;
      }
    }
  }
  return best;
}

/** @deprecated Prefer CRM_NAV_GROUPS + flattenCrmNav — kept for funnel imports */
export const CRM_NAV: CrmNavItem[] = flattenCrmNav();
