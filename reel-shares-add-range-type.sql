-- Widens reel_shares.reel_type to allow sharing a custom-range reel
-- ("Seattle trip"), alongside the existing monthly/birthday reel types.

alter table public.reel_shares drop constraint reel_shares_reel_type_check;
alter table public.reel_shares add constraint reel_shares_reel_type_check
  check (reel_type in ('monthly', 'birthday', 'range'));
