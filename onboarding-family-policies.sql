create policy "Authenticated users can create families"
on public.families
for insert
to authenticated
with check (true);

create policy "Authenticated users can view families"
on public.families
for select
to authenticated
using (true);

create policy "Users can create their own family membership"
on public.family_members
for insert
to authenticated
with check (user_id = auth.uid());

create policy "Users can view memberships in their families"
on public.family_members
for select
to authenticated
using (
  family_id in (
    select fm.family_id
    from public.family_members as fm
    where fm.user_id = auth.uid()
  )
);

create policy "Users can create kids in their families"
on public.kids
for insert
to authenticated
with check (
  user_id = auth.uid()
  and family_id in (
    select fm.family_id
    from public.family_members as fm
    where fm.user_id = auth.uid()
  )
);
