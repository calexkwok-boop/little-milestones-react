alter table entries add column linked_entry_id uuid references entries(id) on delete set null;
