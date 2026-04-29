import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

type CreateProjectBody = {
  project: {
    name: string;
    location?: string | null;
    type?: string;
    status?: string;
    fy?: string | null;
    rera_no?: string | null;
    floors_per_wing: number;
    units_per_floor: number;
    base_rate?: number | null;
    min_rate?: number | null;
    max_rate?: number | null;
  };
  wings: string[];
  unitTypes: string[];
  members?: Array<{ userId: string; role?: string; status?: string }>;
};

function wingSlugForUnitCode(wingName: string, wingIndex: number) {
  const w = wingName.trim();
  const m = w.match(/^tower\s*(\d+)$/i);
  if (m) return `T${m[1]}`;
  if (w.length <= 3 && !/\s/.test(w)) return w.toUpperCase();
  return `W${wingIndex + 1}`;
}

function pickFrom<T>(arr: T[], idx: number) {
  if (arr.length === 0) throw new Error('Empty list');
  return arr[idx % arr.length];
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('projects')
    .select(
      'id,name,location,type,status,fy,rera_no,floors_per_wing,units_per_floor,base_rate,min_rate,max_rate'
    )
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json()) as CreateProjectBody;
  if (!body?.project?.name) {
    return NextResponse.json({ error: 'Missing project name' }, { status: 400 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }
  if (profile?.role !== 'Super Admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();

  const { data: projectRow, error: projErr } = await admin
    .from('projects')
    .insert({
      ...body.project
    })
    .select('id')
    .single();

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  const projectId = projectRow.id as string;

  // Ensure creator is a project member
  const { error: memberErr } = await admin.from('project_members').insert({
    project_id: projectId,
    user_id: user.id,
    role: 'Manager',
    status: 'Active'
  });
  if (memberErr) {
    return NextResponse.json({ error: memberErr.message }, { status: 500 });
  }

  // Optional: assign additional members at creation
  const members = (body.members || []).filter((m) => m?.userId);
  if (members.length) {
    const rows = members.map((m) => ({
      project_id: projectId,
      user_id: m.userId,
      role: m.role || 'Member',
      status: m.status || 'Active'
    }));
    const { error } = await admin.from('project_members').upsert(rows, {
      onConflict: 'project_id,user_id'
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Wings + unit types
  const wings = (body.wings || []).filter(Boolean).map((w) => w.trim());
  const unitTypes = (body.unitTypes || []).filter(Boolean).map((t) => t.trim());

  if (wings.length) {
    const { error } = await admin.from('project_wings').insert(
      wings.map((name, i) => ({
        project_id: projectId,
        name,
        sort_order: i
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (unitTypes.length) {
    const { error } = await admin.from('project_unit_types').insert(
      unitTypes.map((name, i) => ({
        project_id: projectId,
        name,
        sort_order: i
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Seed units
  const areas = [604, 720, 850, 950];
  const floors = Math.max(1, body.project.floors_per_wing || 1);
  const unitsPerFloor = Math.max(1, body.project.units_per_floor || 1);
  const baseRate = body.project.base_rate ?? null;

  const unitRows: Array<Record<string, unknown>> = [];
  wings.forEach((wingName, wingIndex) => {
    const slug = wingSlugForUnitCode(wingName, wingIndex);
    for (let floor = floors; floor >= 1; floor--) {
      for (let unitNo = 1; unitNo <= unitsPerFloor; unitNo++) {
        const code = `${slug}-${floor * 100 + unitNo}`;
        const area = pickFrom(areas, floor * 31 + unitNo * 17 + wingIndex * 13);
        const unitType =
          unitTypes.length > 0
            ? pickFrom(unitTypes, floor * 7 + unitNo + wingIndex * 3)
            : null;
        unitRows.push({
          project_id: projectId,
          wing_name: wingName,
          floor,
          unit_no: unitNo,
          unit_code: code,
          unit_type: unitType,
          area,
          rate: baseRate,
          status: 'A'
        });
      }
    }
  });

  if (unitRows.length) {
    const { error } = await admin.from('units').insert(unitRows);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ projectId });
}

