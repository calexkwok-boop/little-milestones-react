create table if not exists birthday_notifications (
  id text primary key,
  user_id uuid references auth.users not null,
  kid_id uuid not null,
  kid_name text not null,
  family_name text,
  birthdate date,
  age integer not null,
  ts bigint not null,
  dismissed boolean default false,
  created_at timestamptz default now()
);

alter table birthday_notifications enable row level security;

create policy "Users can manage their own birthday notifications"
  on birthday_notifications
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
