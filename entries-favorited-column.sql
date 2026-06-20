alter table public.entries
add column if not exists favorited boolean default false;
