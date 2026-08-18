alter table public.entries
add column if not exists link_group_id text;

create index if not exists entries_link_group_id_idx on public.entries (link_group_id);
