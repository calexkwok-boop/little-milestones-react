alter table families add column name text;

create policy "Family members can update their family name"
  on families for update
  using (exists (select 1 from family_members fm where fm.family_id = families.id and fm.user_id = auth.uid()))
  with check (exists (select 1 from family_members fm where fm.family_id = families.id and fm.user_id = auth.uid()));
