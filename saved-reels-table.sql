-- Stores the *definition* of a custom-range reel (title + date range), not a
-- frozen snapshot — like a monthly reel, it's regenerated live from current
-- entries every time it's opened, so entries added later within that range
-- enrich it automatically. This is a different concept from reel_shares (a
-- frozen snapshot for external sharing) — the two coexist; a saved reel can
-- still be shared via the existing reel_shares flow, which freezes whatever
-- the range currently contains at that moment.

create table if not exists public.saved_reels (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

create index if not exists saved_reels_family_id_idx on public.saved_reels(family_id);

alter table public.saved_reels enable row level security;

create policy "family members can create saved reels"
on public.saved_reels
for insert
to authenticated
with check (
  family_id in (select fm.family_id from public.family_members fm where fm.user_id = auth.uid())
);

create policy "family members can view their own saved reels"
on public.saved_reels
for select
to authenticated
using (
  family_id in (select fm.family_id from public.family_members fm where fm.user_id = auth.uid())
);

create policy "family members can delete their own saved reels"
on public.saved_reels
for delete
to authenticated
using (
  family_id in (select fm.family_id from public.family_members fm where fm.user_id = auth.uid())
);
