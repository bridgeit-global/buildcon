import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Building2,
  FileText,
  Gauge,
  HandCoins,
  Home,
  KeySquare,
  LayoutGrid,
  Settings,
  Shield,
  Users
} from 'lucide-react';

export type CrmNavItem = {
  id:
    | 'dashboard'
    | 'projects'
    | 'inventory'
    | 'bookings'
    | 'customers'
    | 'financials'
    | 'documents'
    | 'rehab'
    | 'reports'
    | 'bankloans'
    | 'users'
    | 'projectsettings';
  /** Shown in sidebar (matches build-con-pos emoji strip). */
  emoji: string;
  /** Optional long title in main header (prototype PAGE_TITLES). */
  pageTitle?: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const CRM_NAV: CrmNavItem[] = [
  {
    id: 'dashboard',
    emoji: '⊞',
    pageTitle: 'Dashboard – Overview',
    label: 'Dashboard',
    href: '/crm/dashboard',
    icon: Gauge
  },
  {
    id: 'projects',
    emoji: '🏢',
    pageTitle: 'Projects (Admin)',
    label: 'Projects',
    href: '/crm/projects',
    icon: Building2
  },
  {
    id: 'inventory',
    emoji: '🏗',
    label: 'Inventory',
    href: '/crm/inventory',
    icon: LayoutGrid
  },
  {
    id: 'bookings',
    emoji: '📋',
    label: 'Bookings',
    href: '/crm/bookings',
    icon: Home
  },
  {
    id: 'customers',
    emoji: '👤',
    label: 'Customers',
    href: '/crm/customers',
    icon: Users
  },
  {
    id: 'financials',
    emoji: '₹',
    pageTitle: 'Finance – Collections & receipts',
    label: 'Financials',
    href: '/crm/financials',
    icon: HandCoins
  },
  {
    id: 'documents',
    emoji: '📄',
    label: 'Documents',
    href: '/crm/documents',
    icon: FileText
  },
  {
    id: 'rehab',
    emoji: '🏘',
    pageTitle: 'Rehab – Members & mapping',
    label: 'Rehab Members',
    href: '/crm/rehab',
    icon: Building2
  },
  {
    id: 'reports',
    emoji: '📊',
    label: 'Reports',
    href: '/crm/reports',
    icon: BarChart3
  },
  {
    id: 'bankloans',
    emoji: '🏦',
    pageTitle: 'Bank & Loans',
    label: 'Bank & Loans',
    href: '/crm/bankloans',
    icon: KeySquare
  },
  {
    id: 'users',
    emoji: '👥',
    pageTitle: 'Users (Admin)',
    label: 'Users & Access',
    href: '/crm/users',
    icon: Shield
  },
  {
    id: 'projectsettings',
    emoji: '⚙',
    label: 'Project Settings',
    href: '/crm/projectsettings',
    icon: Settings
  }
];
