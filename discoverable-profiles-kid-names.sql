-- Adds kid names to the friend-search view, so searching "Leo" can show
-- "Leo — Lily & Lucas" the same way the accepted-friends list already does,
-- helping disambiguate people with the same name.
--
-- Deliberately kid NAMES only, not kid avatar_url or birthdate — children's
-- photos stay private until a friend request is accepted. The friend profile
-- sheet (post-acceptance) already shows real kid avatars via a separate,
-- properly-scoped query; this view must never expose that.

create or replace view public.discoverable_profiles
with (security_invoker = false)
as
select
  p.id,
  p.display_name,
  p.avatar_url,
  coalesce(
    (
      select array_agg(k.name order by k.created_at)
      from public.kids k
      where k.user_id = p.id
         or k.family_id in (select fm.family_id from public.family_members fm where fm.user_id = p.id)
    ),
    '{}'
  ) as kid_names
from public.profiles p
where p.discoverable is true;

grant select on public.discoverable_profiles to authenticated;
