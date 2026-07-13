import Link from 'next/link';
import type { ReactNode } from 'react';

type LegalPageShellProps = {
  title: string;
  lastUpdated: string;
  children: ReactNode;
};

export function LegalPageShell({
  title,
  lastUpdated,
  children
}: LegalPageShellProps) {
  return (
    <div className="min-h-screen bg-ds-gray-50">
      <header className="border-b border-ds-gray-200 bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-base font-semibold text-ds-gray-900 hover:text-ds-primary-600"
          >
            BuildCon CRM
          </Link>
          <Link
            href="/"
            className="text-sm font-medium text-ds-primary-600 hover:text-ds-primary-700"
          >
            Back to sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <article className="rounded-xl border border-ds-gray-200 bg-card p-6 shadow-sm sm:p-8">
          <header className="mb-8 border-b border-ds-gray-100 pb-6">
            <h1 className="text-2xl font-bold tracking-tight text-ds-gray-900 sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm text-ds-gray-500">
              Last updated: {lastUpdated}
            </p>
          </header>

          <div className="legal-prose flex flex-col gap-6 text-sm leading-relaxed text-ds-gray-700 sm:text-base">
            {children}
          </div>
        </article>

        <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-ds-gray-500">
          <Link
            href="/terms-of-service"
            className="font-medium text-ds-primary-600 hover:text-ds-primary-700"
          >
            Terms of Service
          </Link>
          <span aria-hidden="true">·</span>
          <Link
            href="/privacy-policy"
            className="font-medium text-ds-primary-600 hover:text-ds-primary-700"
          >
            Privacy Policy
          </Link>
        </footer>
      </main>
    </div>
  );
}

export function LegalSection({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-ds-gray-900">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
