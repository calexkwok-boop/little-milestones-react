alter table public.entries
add column if not exists type text not null default 'letter';
