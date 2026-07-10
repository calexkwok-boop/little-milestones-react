-- Removes all data created by the throwaway security-test account
-- (patina-sectest-...@mailinator.com) used during this session's testing.
-- Scoped entirely to that one user's id, so it can't touch anyone else's data.

do $$
declare
  test_uid uuid;
begin
  select id into test_uid from auth.users where email like 'patina-sectest-%@mailinator.com' limit 1;

  if test_uid is not null then
    delete from public.entry_media where entry_id in (select id from public.entries where user_id = test_uid);
    delete from public.entry_likes where user_id = test_uid;
    delete from public.entry_comments where user_id = test_uid;
    delete from public.entries where user_id = test_uid;
    delete from public.kids where user_id = test_uid;
    delete from public.family_members where user_id = test_uid;
    delete from public.families where created_by = test_uid; -- covers both the onboarding family and the earlier orphaned empty one
    delete from public.friend_requests where requester_id = test_uid or addressee_id = test_uid;
    delete from public.profiles where id = test_uid;
    raise notice 'Cleaned up data for test user %', test_uid;
  else
    raise notice 'No matching test user found — nothing to clean up';
  end if;
end $$;
