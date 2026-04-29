'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { useActiveProjectContext } from '../_components/active-project-context';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type ProfileRow = { id: string; name: string | null; role: string };
type MemberRow = {
  project_id: string;
  user_id: string;
  role: string;
  status: string;
  created_at: string;
};

export default function UsersPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { activeProjectId } = useActiveProjectContext();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');

    const {
      data: { user },
      error: userErr
    } = await supabase.auth.getUser();

    if (userErr) setError(userErr.message);
    if (user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,name,role')
        .eq('id', user.id)
        .maybeSingle();
      if (error) setError(error.message);
      setProfile((data ?? null) as ProfileRow | null);
    }

    if (activeProjectId) {
      const { data, error } = await supabase
        .from('project_members')
        .select('project_id,user_id,role,status,created_at')
        .eq('project_id', activeProjectId)
        .order('created_at', { ascending: true });
      if (error) setError(error.message);
      setMembers((data ?? []) as MemberRow[]);
    } else {
      setMembers([]);
    }

    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-gray-900">
            Users & Access (MVP)
          </div>
          <div className="text-xs text-gray-500">
            View your role and the active project’s membership list.
          </div>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </Card>

      {error ? (
        <Card className="p-4 border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-900">My profile</div>
          <div className="mt-3 text-sm text-gray-700">
            <div>
              <span className="text-gray-500">Role:</span>{' '}
              <strong>{profile?.role ?? '—'}</strong>
            </div>
            <div className="mt-1">
              <span className="text-gray-500">Name:</span>{' '}
              <strong>{profile?.name ?? '—'}</strong>
            </div>
            <div className="mt-1">
              <span className="text-gray-500">User id:</span>{' '}
              <span className="font-mono text-xs">{profile?.id ?? '—'}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold text-gray-900">
            Active project members
          </div>
          <div className="mt-1 text-xs text-gray-500">
            {activeProjectId ? members.length : 0} member(s)
          </div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-[520px] w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500">
                <tr>
                  {['User id', 'Role', 'Status'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} className="border-b">
                    <td className="px-3 py-2 font-mono text-xs text-gray-700">
                      {m.user_id}
                    </td>
                    <td className="px-3 py-2 text-gray-700">{m.role}</td>
                    <td className="px-3 py-2 text-gray-700">{m.status}</td>
                  </tr>
                ))}
                {activeProjectId && members.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-gray-500">
                      No members found (or you don’t have access).
                    </td>
                  </tr>
                ) : null}
                {!activeProjectId ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8 text-center text-gray-500">
                      Select a project first.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

