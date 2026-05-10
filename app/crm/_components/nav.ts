import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Briefcase,
  Building2,
  FileText,
  Gauge,
  HandCoins,
  Home,
  KeySquare,
  LayoutGrid,
  MessageCircle,
  Shield,
  Users
} from 'lucide-react';

export type CrmNavItem = {
  id:
    | 'dashboard'
    | 'project'
    | 'inventory'
    | 'bookings'
    | 'inquiry'
    | 'customers'
    | 'brokers'
    | 'financials'
    | 'documents'
    | 'rehab'
    | 'reports'
    | 'bankloans'
    | 'users';
  /** Optional long title in main header (prototype PAGE_TITLES). */
  pageTitle?: string;
  label: string;
  href: string;
  icon: LucideIcon;
};

export const CRM_NAV: CrmNavItem[] = [
  {
    id: 'dashboard',
    pageTitle: 'Dashboard – Overview',
    label: 'Dashboard',
    href: '/crm/dashboard',
    icon: Gauge
  },
  {
    id: 'project',
    pageTitle: 'Project',
    label: 'Project',
    href: '/crm/project',
    icon: Building2
  },
  {
    id: 'inventory',
    label: 'Inventory',
    href: '/crm/inventory',
    icon: LayoutGrid
  },
  {
    id: 'inquiry',
    pageTitle: 'Inquiry – Sales leads',
    label: 'Inquiry',
    href: '/crm/inquiry',
    icon: MessageCircle
  },
  {
    id: 'bookings',
    label: 'Bookings',
    href: '/crm/bookings',
    icon: Home
  },
  {
    id: 'customers',
    label: 'Customers',
    href: '/crm/customers',
    icon: Users
  },
  {
    id: 'brokers',
    label: 'Brokers',
    href: '/crm/brokers',
    icon: Briefcase
  },
  {
    id: 'financials',
    pageTitle: 'Finance – Collections & receipts',
    label: 'Financials',
    href: '/crm/financials',
    icon: HandCoins
  },
  {
    id: 'documents',
    label: 'Documents',
    href: '/crm/documents',
    icon: FileText
  },
  {
    id: 'rehab',
    pageTitle: 'Rehab – Members & mapping',
    label: 'Rehab Members',
    href: '/crm/rehab',
    icon: Building2
  },
  {
    id: 'reports',
    label: 'Reports',
    href: '/crm/reports',
    icon: BarChart3
  },
  {
    id: 'bankloans',
    pageTitle: 'Bank & Loans',
    label: 'Bank & Loans',
    href: '/crm/bankloans',
    icon: KeySquare
  },
  {
    id: 'users',
    pageTitle: 'Users (Admin)',
    label: 'Users & Access',
    href: '/crm/users',
    icon: Shield
  }
];
