alter table entries add column same_age_kid_id uuid references kids(id) on delete set null;
alter table entries add column same_age_date date;
