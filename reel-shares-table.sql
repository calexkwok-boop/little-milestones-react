-- Public, view-only share links for a monthly recap reel or a birthday reel —
-- same security shape as entry-share-links.sql (get_shared_entry): access is
-- gated entirely through get_shared_reel(), NOT an RLS policy that exposes
-- rows by share_token, because a naive `using (true)` anon SELECT policy
-- would let anyone enumerate every publicly-shared reel site-wide. A
-- SECURITY DEFINER function that only returns a row on an exact token match
-- has no such enumeration path.
--
-- Unlike entries.share_token (one mutable column on a persistent row), a reel
-- isn't a row that exists independently of being viewed — it's computed
-- client-side each time from that month's/that kid's entries. So each "Share"
-- tap freezes a snapshot (payload jsonb: the exact slides, song, and stats
-- used) into its own row here, rather than reusing/mutating a single token.
-- Revoking a share means deleting its row.

create table if not exists public.reel_shares (
  id uuid primary key default gen_random_uuid(),
  share_token uuid unique not null default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  reel_type text not null check (reel_type in ('monthly', 'birthday')),
  title text,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists reel_shares_family_id_idx on public.reel_shares(family_id);

alter table public.reel_shares enable row level security;

create policy "family members can create reel shares"
on public.reel_shares
for insert
to authenticated
with check (
  family_id in (select fm.family_id from public.family_members fm where fm.user_id = auth.uid())
);

create policy "family members can view their own reel shares"
on public.reel_shares
for select
to authenticated
using (
  family_id in (select fm.family_id from public.family_members fm where fm.user_id = auth.uid())
);

create policy "family members can revoke their own reel shares"
on public.reel_shares
for delete
to authenticated
using (
  family_id in (select fm.family_id from public.family_members fm where fm.user_id = auth.uid())
);

create or replace function public.get_shared_reel(p_token uuid)
returns table (id uuid, reel_type text, title text, payload jsonb)
language sql security definer set search_path = public as $$
  select id, reel_type, title, payload from public.reel_shares where share_token = p_token;
$$;

grant execute on function public.get_shared_reel(uuid) to anon;
