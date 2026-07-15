-- Current entries policies (confirmed via pg_policies 2026-07-15):
--   "Users manage their own entries" (ALL, using/with_check: auth.uid() = user_id)
--   "family update entries" (UPDATE, using: user_id = auth.uid() OR family_id = get_my_family_id())
--   "family insert entries" (INSERT, with_check: family_id in caller's family_members)
--   two overlapping family-scoped SELECT policies
-- No family-wide DELETE policy exists, so delete is already author-only —
-- that part needs no change.
--
-- "family update entries" lets any family member's UPDATE statement reach any
-- entry in the family (needed so co-parents can crop each other's photos).
-- But it doesn't otherwise restrict which columns change, so today a family
-- member can silently rewrite the text, date, sharing settings, etc. of a
-- letter they didn't write. Decision: only the author may edit content;
-- any family member may adjust crop_y (aesthetic) or favorited (a shared
-- bookmark, not content) only. Enforced with a trigger since RLS policies
-- gate rows, not columns.

create or replace function public.enforce_entries_edit_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.user_id <> auth.uid() then
    if (NEW.id, NEW.user_id, NEW.kid_ids, NEW.text, NEW.mood, NEW.milestone, NEW.date,
        NEW.age_months, NEW.palette, NEW.created_at, NEW.family_id, NEW.author_id,
        NEW.signed_as, NEW.entry_type, NEW.location, NEW.location_lat,
        NEW.location_lng, NEW.song, NEW.people, NEW.shared, NEW.voice_memo_url,
        NEW.shared_with, NEW.type, NEW.prompt, NEW.share_token)
       IS DISTINCT FROM
       (OLD.id, OLD.user_id, OLD.kid_ids, OLD.text, OLD.mood, OLD.milestone, OLD.date,
        OLD.age_months, OLD.palette, OLD.created_at, OLD.family_id, OLD.author_id,
        OLD.signed_as, OLD.entry_type, OLD.location, OLD.location_lat,
        OLD.location_lng, OLD.song, OLD.people, OLD.shared, OLD.voice_memo_url,
        OLD.shared_with, OLD.type, OLD.prompt, OLD.share_token)
    then
      raise exception 'Only the author can edit this entry — family members may only adjust the photo crop or favorite status.';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists entries_enforce_edit_scope on public.entries;
create trigger entries_enforce_edit_scope
before update on public.entries
for each row execute function public.enforce_entries_edit_scope();
