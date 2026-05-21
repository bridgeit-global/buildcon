# BuildCon CRM (Next.js + Supabase)

Staff CRM built with Next.js (App Router) and Supabase.

## Features (MVP)

- ✅ Supabase Auth (email/password) for staff
- ✅ Project-scoped CRM (`/crm`) with sidebar + project switcher
- ✅ Projects (create + seed inventory units)
- ✅ Inventory (list/search + block/unblock)
- ✅ Customers (CRUD)
- ✅ Bookings (create booking + mark unit booked + seed payment schedule)
- ✅ Financials (payment schedule + collections entry)
- ✅ Bank loans (loan cases)
- ✅ Documents (templates + generated document records; confirmed bookings: generate/store HTML in **documents** storage, download, optional SMTP email + WhatsApp share)
- ✅ Reports (basic aggregates)
- ✅ Sales pipeline (opportunities, funnel stages, follow-ups, site visits) on inquiries
- ✅ Quotations + project pricing profile (GST / stamp duty / registration estimates)
- ✅ Collections ledger view (demand vs receipts, outstanding, overdue) for dashboards and finance
- ✅ Financials CSV export (ledger + receipts) for spreadsheets and manual Tally / ERP import
- ✅ Construction-linked demand (CLD) stages and completions
- ✅ Possession & handover cases (checklist / snag JSON, workflow stages)
- ✅ Buyer portal at `/portal` for customers linked on their profile (read own bookings and related data)

## Tech Stack

- [Next.js](https://nextjs.org/) with App Router
- [React 19](https://react.dev/)
- [Supabase](https://supabase.com/) (Auth, Postgres, Storage)
- [Tailwind 4](https://tailwindcss.com/) for styling
- [shadcn/ui](https://ui.shadcn.com/) for the design system

## Getting Started

### Prerequisites

- Node.js 18.17.0 or later
- pnpm (recommended) or npm/yarn
- Supabase project (Database + Auth)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/vercel/platforms.git
   cd platforms
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory with (see `.env.example`):

   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only)

4. Start the development server:

   ```bash
   pnpm dev
   ```

5. Access the application:
   - Landing: http://localhost:3000
   - CRM: http://localhost:3000/crm (redirects to `/login` if not authenticated)
   - Buyer portal: http://localhost:3000/portal (same auth; customer data visible when `linked_customer_id` is set on the user profile)

## Deployment

This application is designed to be deployed on Vercel. To deploy:

1. Push your repository to GitHub
2. Connect your repository to Vercel
3. Configure environment variables
4. Deploy

For custom domains, configure your Vercel project normally.
