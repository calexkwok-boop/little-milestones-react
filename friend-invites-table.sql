-- Friend invite links: "Invite a friend" shares a short code via native share sheet.
-- Redemption happens exclusively through the redeem-invite edge function
-- (service role), so no client-side update/delete policy is needed here —
-- that keeps codes from being enumerable or forgeable by other users.

create table if not exists friend_invites (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id)
);

alter table friend_invites enable row level security;

create policy "friend_invites_insert_own" on friend_invites
  for insert
  with check (inviter_id = auth.uid());

create policy "friend_invites_select_own" on friend_invites
  for select
  using (inviter_id = auth.uid());
