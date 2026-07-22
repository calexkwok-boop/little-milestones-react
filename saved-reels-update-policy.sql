-- saved_reels had insert/select/delete RLS policies but no update policy —
-- every update (reel editor save, auto-picked-song freeze) silently matched
-- zero rows under RLS instead of erroring, so edits looked saved in the UI
-- but never actually persisted past a reload.
create policy "family members can update their own saved reels"
on public.saved_reels
for update
to authenticated
using (
  family_id in (select fm.family_id from public.family_members fm where fm.user_id = auth.uid())
)
with check (
  family_id in (select fm.family_id from public.family_members fm where fm.user_id = auth.uid())
);
