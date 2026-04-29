import Link from 'next/link';

export default async function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-linear-to-b from-blue-50 to-white p-4">
      <div className="w-full max-w-xl space-y-6 rounded-xl border bg-white p-8 shadow-sm">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            BuildCon CRM
          </h1>
          <p className="text-gray-600">
            Staff CRM for projects, inventory, customers, bookings, and
            financials.
          </p>
        </div>

        <div className="flex items-center justify-center gap-3">
          <Link
            href="/crm"
            className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Open CRM
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Sign in
          </Link>
        </div>

        <div className="text-xs text-gray-500 text-center">
          If you are not logged in, you’ll be redirected to `/login`.
        </div>
      </div>
    </div>
  );
}
