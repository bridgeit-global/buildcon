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
  label: string;
  href: string;
  icon: LucideIcon;
};

export const CRM_NAV: CrmNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/crm/dashboard', icon: Gauge },
  {
    id: 'inventory',
    label: 'Inventory',
    href: '/crm/inventory',
    icon: LayoutGrid
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
    id: 'financials',
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
    label: 'Bank & Loans',
    href: '/crm/bankloans',
    icon: KeySquare
  },
  {
    id: 'users',
    label: 'Users & Access',
    href: '/crm/users',
    icon: Shield
  },
  {
    id: 'projectsettings',
    label: 'Project Settings',
    href: '/crm/projectsettings',
    icon: Settings
  }
];

