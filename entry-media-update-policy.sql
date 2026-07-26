-- entry_media has never been UPDATEd before (only inserted/deleted) — per-photo
-- crop_y is the first feature to need it. Without this policy, Supabase's RLS
-- silently matches 0 rows on update (no error), so the crop appears to save
-- client-side but never actually persists.
create policy "Family members can update their own entry_media"
on public.entry_media
for update
to authenticated
using (
  entry_id in (
    select e.id from public.entries e
    where e.family_id in (
      select fm.family_id from public.family_members fm where fm.user_id = auth.uid()
    )
  )
)
with check (
  entry_id in (
    select e.id from public.entries e
    where e.family_id in (
      select fm.family_id from public.family_members fm where fm.user_id = auth.uid()
    )
  )
);
