import { redirect } from 'next/navigation';

/** Legacy route — CLD is managed per project from the Projects list. */
export default function CldLegacyRedirectPage() {
  redirect('/crm/project');
}
