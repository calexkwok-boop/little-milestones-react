-- Regression from security-hardening-profiles-families.sql: that migration's
-- "Users can view friend profiles" policy only grants access via a
-- friend_requests relationship. Co-parents in the same family aren't
-- "friends" in that sense, so App.jsx:6763 (which reads profiles.display_name
-- directly to build each family member's real_name) silently returns nothing
-- for a family member you haven't separately friended — even though their
-- data is otherwise correct. Search still worked because it goes through the
-- discoverable_profiles view, which bypasses base-table RLS entirely.
--
-- Fix: also allow reading a profile if the requester shares a family with
-- that user (via family_members), matching what App.jsx:6763 actually needs.

create policy "Users can view family member profiles"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.family_members fm1
    join public.family_members fm2 on fm1.family_id = fm2.family_id
    where fm1.user_id = auth.uid() and fm2.user_id = profiles.id
  )
);
