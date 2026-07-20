alter table public.saved_reels add column if not exists duration_sec integer not null default 30;
alter table public.saved_reels add column if not exists song2 jsonb;
