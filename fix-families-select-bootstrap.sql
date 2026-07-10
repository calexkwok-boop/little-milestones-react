-- The families_select fix from security-hardening-profiles-families.sql
-- broke onboarding: creating a family does
--   supabase.from('families').insert({}).select().single()
-- and PostgREST's implicit RETURNING read-back requires the new row to
-- pass the SELECT policy too. At the moment of insert, the creator has
-- no family_members row yet (that's the very next step), so the
-- membership-based policy denied the read-back and the insert appeared
-- to fail with a row-level security error.
--
-- Fix: track who created each family, and let the creator read their
-- own row even before they're linked via family_members.

alter table public.families add column if not exists created_by uuid references auth.users(id);
alter table public.families alter column created_by set default auth.uid();

drop policy "Users can view their own families" on public.families;

create policy "Users can view their own families"
on public.families
for select
to authenticated
using (
  created_by = auth.uid()
  or id in (
    select fm.family_id
    from public.family_members as fm
    where fm.user_id = auth.uid()
  )
);
