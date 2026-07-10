-- Confirmed via pg_policies: the wide-open policies are named
-- "Users can read all profiles" (profiles) and "families_select" (families),
-- both `using (true)`. Drop those explicitly before adding the scoped ones.

-- ── profiles ─────────────────────────────────────────────────────────────
-- Lock the base table down to: your own row, accepted friends (need family_id
-- for circle-feed resolution), or anyone you have a pending friend_request
-- with in either direction (needed to render request cards with name/avatar).

drop policy "Users can read all profiles" on public.profiles;

create policy "Users can view their own profile"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "Users can view friend profiles"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1 from public.friend_requests fr
    where (fr.requester_id = auth.uid() and fr.addressee_id = profiles.id)
       or (fr.addressee_id = auth.uid() and fr.requester_id = profiles.id)
  )
);

-- Narrow, purpose-built view for friend search — exposes only what search
-- needs (id, display_name, avatar_url) for discoverable, non-self users.
-- Runs as the view owner, so it can read the full (RLS-locked) profiles
-- table internally while only ever returning this safe subset to callers.

create or replace view public.discoverable_profiles
with (security_invoker = false)
as
select id, display_name, avatar_url
from public.profiles
where discoverable is true;

grant select on public.discoverable_profiles to authenticated;

-- ── families ─────────────────────────────────────────────────────────────
-- Replace "families_select" (using (true)) with a membership-scoped policy,
-- mirroring the existing family_members policy. families_insert (with_check:
-- true) is untouched — any authenticated user creating a family during
-- onboarding is expected behavior.

drop policy "families_select" on public.families;

create policy "Users can view their own families"
on public.families
for select
to authenticated
using (
  id in (
    select fm.family_id
    from public.family_members as fm
    where fm.user_id = auth.uid()
  )
);
