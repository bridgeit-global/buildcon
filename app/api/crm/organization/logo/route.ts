import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { requireOrgAdmin } from '@/lib/authz';
import {
  ORG_BRAND_LOGO_BUCKET,
  brandLogoStoragePath,
  createBrandLogoSignedUrl,
  validateBrandLogoFile
} from '@/lib/organization/brand-logo';
import type { OrganizationSettings } from '@/lib/organization/organization-settings';

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

export async function POST(request: Request) {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Logo file is required' }, { status: 400 });
  }

  const validated = validateBrandLogoFile(file);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
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

    const storagePath = brandLogoStoragePath(validated.ext);
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from(ORG_BRAND_LOGO_BUCKET)
      .upload(storagePath, bytes, {
        contentType: file.type || `image/${validated.ext}`,
        upsert: true,
        cacheControl: '3600'
      });
    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const previous = String(existing.logo_storage_path ?? '').trim();
    if (previous && previous !== storagePath) {
      await admin.storage.from(ORG_BRAND_LOGO_BUCKET).remove([previous]);
    }

    const { data, error } = await admin
      .from('organization_settings')
      .update({
        logo_storage_path: storagePath,
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
      { error: e instanceof Error ? e.message : 'Failed to upload logo' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  const gate = await requireOrgAdmin();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
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

    const previous = String(existing.logo_storage_path ?? '').trim();
    if (previous) {
      await admin.storage.from(ORG_BRAND_LOGO_BUCKET).remove([previous]);
    }

    const { data, error } = await admin
      .from('organization_settings')
      .update({
        logo_storage_path: null,
        updated_at: new Date().toISOString(),
        updated_by: gate.userId
      })
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      organization: data as OrganizationSettings,
      logoUrl: null
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to remove logo' },
      { status: 500 }
    );
  }
}
