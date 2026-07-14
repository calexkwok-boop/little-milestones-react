-- Adds avatar_url/accent to get_shared_entry's kid_names payload so the
-- shared page can show the kid's actual avatar (or their accent-colored
-- initial, matching KidThumb's fallback) next to the salutation — makes
-- clear at a glance what Patina is even to someone who's never seen it.

create or replace function public.get_shared_entry(p_token uuid)
returns table (
  id uuid, text text, date date, age_months integer, kid_ids uuid[],
  media jsonb, kid_names jsonb
)
language sql security definer set search_path = public as $$
  select e.id, e.text, e.date, e.age_months, e.kid_ids,
    coalesce((select jsonb_agg(jsonb_build_object('url', m.url, 'type', m.type) order by m.created_at)
              from entry_media m where m.entry_id = e.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('name', k.name, 'birthdate', k.birthdate, 'avatarUrl', k.avatar_url, 'accent', k.accent))
              from kids k where k.id = any(e.kid_ids)), '[]'::jsonb)
  from entries e
  where e.share_token = p_token;
$$;

grant execute on function public.get_shared_entry(uuid) to anon;
