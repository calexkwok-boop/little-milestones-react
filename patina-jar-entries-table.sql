-- One clip per kid per (year, calendar month) — a fixed question repeats every
-- year (see PATINA_JAR_QUESTIONS in constants.js), so month_index lets this
-- March's clip be compared against last March's. Not entry/entry_media scoped
-- (see entry-media-kid-id-column.sql) since these don't belong on the main
-- journal timeline and have per-kid+year+month uniqueness entries don't have.

create table if not exists public.patina_jar_entries (
  id uuid primary key default gen_random_uuid(),
  kid_id uuid not null references public.kids(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  month_index int not null check (month_index between 1 and 12),
  year int not null,
  video_url text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (kid_id, year, month_index)
);

create index if not exists patina_jar_entries_family_id_idx on public.patina_jar_entries(family_id);
create index if not exists patina_jar_entries_kid_id_idx on public.patina_jar_entries(kid_id);

alter table public.patina_jar_entries enable row level security;

-- Create/delete only, no update policy — re-recording a month deletes then
-- re-inserts rather than updating a row in place.

create policy "family members can create patina jar entries"
on public.patina_jar_entries
for insert
to authenticated
with check (
  family_id in (select fm.family_id from public.family_members fm where fm.user_id = auth.uid())
);

create policy "family members can view their own patina jar entries"
on public.patina_jar_entries
for select
to authenticated
using (
  family_id in (select fm.family_id from public.family_members fm where fm.user_id = auth.uid())
);

create policy "family members can delete their own patina jar entries"
on public.patina_jar_entries
for delete
to authenticated
using (
  family_id in (select fm.family_id from public.family_members fm where fm.user_id = auth.uid())
);
