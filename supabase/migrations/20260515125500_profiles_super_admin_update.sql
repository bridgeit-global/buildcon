-- Allow Super Admins to set portal link fields on any profile (buyer / broker portal).

create policy "profiles_update_super_admin_any"
on public.profiles
for update
using (public.is_super_admin())
with check (public.is_super_admin());
