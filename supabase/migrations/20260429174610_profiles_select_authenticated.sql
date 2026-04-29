-- Allow staff to list profiles (for user assignment UI).
-- NOTE: Keep update limited to self; this is select-only.

drop policy if exists "profiles_select_authenticated" on public.profiles;

create policy "profiles_select_authenticated"
on public.profiles
for select
using (auth.role() = 'authenticated');

