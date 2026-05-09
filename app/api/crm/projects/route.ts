import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getProfileRole, isSuperAdmin, requireSuperAdmin } from '@/lib/authz';
import type { CrmProjectListItem } from '@/app/crm/_components/types';

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

function initialsFromName(name: string | null | undefined) {
  const n = (name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return n.slice(0, 2).toUpperCase();
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const roleRes = await getProfileRole(user.id);
  const canCreateProject = roleRes.ok && isSuperAdmin(roleRes.role);

  const { data, error } = await supabase
    .from('projects')
    .select(
      'id,name,location,type,status,fy,rera_no,floors_per_wing,units_per_floor,base_rate,min_rate,max_rate'
    )
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const projects = data ?? [];
  const ids = projects.map((p) => p.id);

  const wingCountMap = new Map<string, number>();
  const unitCountMap = new Map<string, number>();
  const memberCountMap = new Map<string, number>();
  const memberPreviewMap = new Map<
    string,
    Array<{ user_id: string; name: string | null; initials: string }>
  >();

  if (ids.length > 0) {
    const [{ data: wingRows }, unitPairs, { data: memberRows }] = await Promise.all([
      supabase.from('project_wings').select('project_id').in('project_id', ids),
      Promise.all(
        ids.map(async (id) => {
          const { count } = await supabase
            .from('units')
            .select('*', { count: 'exact', head: true })
            .eq('project_id', id);
          return [id, count ?? 0] as const;
        })
      ),
      supabase.from('project_members').select('project_id,user_id').in('project_id', ids)
    ]);

    for (const row of wingRows ?? []) {
      const id = row.project_id as string;
      wingCountMap.set(id, (wingCountMap.get(id) ?? 0) + 1);
    }

    for (const [id, c] of unitPairs) {
      unitCountMap.set(id, c);
    }

    const memberList = memberRows ?? [];
    for (const row of memberList) {
      const pid = row.project_id as string;
      memberCountMap.set(pid, (memberCountMap.get(pid) ?? 0) + 1);
    }

    const userIds = [...new Set(memberList.map((m) => m.user_id as string))];
    let profileById = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id,name')
        .in('id', userIds);
      profileById = new Map((profs ?? []).map((p) => [p.id as string, p.name]));
    }

    const grouped = new Map<string, string[]>();
    for (const row of memberList) {
      const pid = row.project_id as string;
      const uid = row.user_id as string;
      const arr = grouped.get(pid) ?? [];
      arr.push(uid);
      grouped.set(pid, arr);
    }

    for (const [pid, uids] of grouped) {
      const preview = uids.slice(0, 4).map((uid) => {
        const name = profileById.get(uid) ?? null;
        return {
          user_id: uid,
          name,
          initials: initialsFromName(name)
        };
      });
      memberPreviewMap.set(pid, preview);
    }
  }

  const enriched: CrmProjectListItem[] = projects.map((p) => {
    const wing_count = wingCountMap.get(p.id) ?? 0;
    const unit_count = unitCountMap.get(p.id) ?? 0;
    const member_count = memberCountMap.get(p.id) ?? 0;
    const member_preview = memberPreviewMap.get(p.id) ?? [];
    return {
      ...p,
      wing_count,
      unit_count,
      member_count,
      member_preview
    };
  });

  return NextResponse.json({ projects: enriched, canCreateProject });
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await request.json()) as CreateProjectBody;
  if (!body?.project?.name) {
    return NextResponse.json({ error: 'Missing project name' }, { status: 400 });
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
    user_id: gate.userId,
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

