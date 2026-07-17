alter table entry_media add column kid_id uuid references kids(id) on delete set null;
