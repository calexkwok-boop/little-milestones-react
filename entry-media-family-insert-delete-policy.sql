-- entries has "family update entries" (user_id = auth.uid() OR family_id =
-- get_my_family_id()), letting a partner edit the other's entries -- but
-- entry_media only ever had the owner-only "Users manage their entry media"
-- (ALL) policy plus a family-scoped UPDATE-only policy (for crop_y edits).
-- No family-scoped INSERT/DELETE policy existed, so when a partner edited
-- the other's entry, the entries row saved fine but the photo delete+
-- reinsert (handleSaveEntry's edit path) silently 403'd, and the entry's
-- media appeared to just vanish/fail to update.
create policy "Family members can insert their family's entry_media"
on public.entry_media
for insert
to authenticated
with check (
  entry_id in (
    select e.id from public.entries e
    where e.family_id in (
      select fm.family_id from public.family_members fm where fm.user_id = auth.uid()
    )
  )
);

create policy "Family members can delete their family's entry_media"
on public.entry_media
for delete
to authenticated
using (
  entry_id in (
    select e.id from public.entries e
    where e.family_id in (
      select fm.family_id from public.family_members fm where fm.user_id = auth.uid()
    )
  )
);
