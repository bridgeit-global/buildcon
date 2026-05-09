import { redirect } from 'next/navigation';

type PageProps = {
  searchParams?: Promise<{ create?: string }>;
};

export default async function LegacyProjectSettingsRedirect({ searchParams }: PageProps) {
  const q = searchParams ? await searchParams : {};
  if (q.create === '1') {
    redirect('/crm/project?create=1');
  }
  redirect('/crm/project');
}
