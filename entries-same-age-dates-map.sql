alter table entries add column same_age_dates jsonb;
update entries set same_age_dates = jsonb_build_object(same_age_kid_id::text, same_age_date) where same_age_kid_id is not null;
alter table entries drop column same_age_kid_id;
alter table entries drop column same_age_date;
