'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const LINKS = [
  { href: '/portal', label: 'Home' },
  { href: '/portal/receipts', label: 'Receipts' },
  { href: '/portal/demands', label: 'Demands' },
  { href: '/portal/documents', label: 'Documents' },
  { href: '/portal/updates', label: 'Construction' },
  { href: '/portal/service', label: 'Service' }
] as const;

function linkActive(href: string, pathname: string) {
  if (href === '/portal') {
    return (
      pathname === '/portal' ||
      pathname === '/portal/' ||
      pathname.startsWith('/portal/bookings')
    );
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalNav() {
  const pathname = usePathname() || '';
  return (
    <nav
      className="flex flex-wrap gap-1 border-b border-slate-200 bg-white px-2 pb-0 pt-1"
      aria-label="Buyer portal"
    >
      {LINKS.map(({ href, label }) => {
        const active = linkActive(href, pathname);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'rounded-t-md px-3 py-2 text-xs font-semibold transition-colors',
              active
                ? 'border border-b-0 border-slate-200 bg-slate-50 text-slate-900'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            )}
          >
            {label}
          </Link>
        );
      })}
      <Link
        href="/crm/dashboard"
        className="ml-auto self-center px-2 py-2 text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
      >
        Staff CRM
      </Link>
    </nav>
  );
}
