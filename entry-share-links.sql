-- Public, view-only share links for a single entry — lets someone without a
-- Patina account see one photo/letter, distinct from the friends/family
-- model. Access is gated entirely through get_shared_entry(), NOT through an
-- RLS policy on entries: a naive `using (share_token is not null)` anon
-- policy would let anyone enumerate every publicly-shared entry site-wide
-- (RLS governs which rows are visible, not what a client happened to filter
-- for). A SECURITY DEFINER function that only returns a row on an exact
-- token match has no such enumeration path.

alter table public.entries add column if not exists share_token uuid unique;

create or replace function public.get_shared_entry(p_token uuid)
returns table (
  id uuid, text text, date date, age_months integer, kid_ids uuid[],
  media jsonb, kid_names jsonb
)
language sql security definer set search_path = public as $$
  select e.id, e.text, e.date, e.age_months, e.kid_ids,
    coalesce((select jsonb_agg(jsonb_build_object('url', m.url, 'type', m.type) order by m.created_at)
              from entry_media m where m.entry_id = e.id), '[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object('name', k.name, 'birthdate', k.birthdate))
              from kids k where k.id = any(e.kid_ids)), '[]'::jsonb)
  from entries e
  where e.share_token = p_token;
$$;

grant execute on function public.get_shared_entry(uuid) to anon;
