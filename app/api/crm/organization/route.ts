import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireOrgAdmin, requireUser } from '@/lib/authz';
import {
  organizationSettingsFormSchema,
  organizationSettingsPayload
} from '@/lib/organization/organization-settings.schema';
import type { OrganizationSettings } from '@/lib/organization/organization-settings';
import { createBrandLogoSignedUrl } from '@/lib/organization/brand-logo';

async function loadSingleton(
  admin: ReturnType<typeof createSupabaseAdminClient>
): Promise<OrganizationSettings | null> {
  const { data, error } = await admin
    .from('organization_settings')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OrganizationSettings | null) ?? null;
}

export async function GET() {
  const gate = await requireUser();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const admin = createSupabaseAdminClient();
    const org = await loadSingleton(admin);
    if (!org) {
      return NextResponse.json(
        { error: 'Organization settings not found' },
        { status: 404 }
      );
    }
    const logoUrl = await createBrandLogoSignedUrl(admin, org.logo_storage_path);
    return NextResponse.json({ organization: org, logoUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load organization' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = organizationSettingsFormSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid organization details' },
      { status: 400 }
    );
  }

  try {
    const admin = createSupabaseAdminClient();
    const existing = await loadSingleton(admin);
    if (!existing) {
      return NextResponse.json(
        { error: 'Organization settings not found' },
        { status: 404 }
      );
    }

    const payload = organizationSettingsPayload(parsed.data);
    const { data, error } = await admin
      .from('organization_settings')
      .update({
        ...payload,
        updated_at: new Date().toISOString(),
        updated_by: gate.userId
      })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    const organization = data as OrganizationSettings;
    const logoUrl = await createBrandLogoSignedUrl(
      admin,
      organization.logo_storage_path
    );
    return NextResponse.json({ organization, logoUrl });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update organization' },
      { status: 500 }
    );
  }
}
