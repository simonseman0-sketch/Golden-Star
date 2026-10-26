-- V74: preserve the selected invoice section alongside each SKU's existing QuickBooks item/price override.
-- Run in Supabase SQL Editor before deploying V74. Existing values and RLS policies remain unchanged.
begin;
alter table public.gs_qb_item_overrides
  add column if not exists invoice_group integer;
alter table public.gs_qb_item_overrides
  drop constraint if exists gs_qb_item_overrides_invoice_group_check;
alter table public.gs_qb_item_overrides
  add constraint gs_qb_item_overrides_invoice_group_check
  check (invoice_group is null or invoice_group between 1 and 6);
commit;
