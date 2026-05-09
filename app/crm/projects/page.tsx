import { redirect } from 'next/navigation';

export default function LegacyProjectsRedirect() {
  redirect('/crm/project');
}
