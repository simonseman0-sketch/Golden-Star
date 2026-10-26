-- Golden Star V64: secure SKU -> QuickBooks item/description/price overrides.
-- Only enabled gs_sales_staff administrators can read or write. Run in Supabase SQL Editor.
begin;
create table if not exists public.gs_qb_item_overrides (
 sku text primary key check (length(trim(sku)) between 1 and 40),
 item_name text not null check(length(trim(item_name))>0),
 description text not null default '',
 price numeric(14,4) not null check(price>=0),
 updated_at timestamptz not null default now(),
 updated_by uuid references auth.users(id)
);
alter table public.gs_qb_item_overrides enable row level security;
revoke all on table public.gs_qb_item_overrides from public,anon;
grant select,insert,update on table public.gs_qb_item_overrides to authenticated;
drop policy if exists gs_qb_overrides_admin_select on public.gs_qb_item_overrides;
create policy gs_qb_overrides_admin_select on public.gs_qb_item_overrides for select to authenticated using (public.gs_sales_is_admin());
drop policy if exists gs_qb_overrides_admin_insert on public.gs_qb_item_overrides;
create policy gs_qb_overrides_admin_insert on public.gs_qb_item_overrides for insert to authenticated with check (public.gs_sales_is_admin() and updated_by=auth.uid());
drop policy if exists gs_qb_overrides_admin_update on public.gs_qb_item_overrides;
create policy gs_qb_overrides_admin_update on public.gs_qb_item_overrides for update to authenticated using (public.gs_sales_is_admin()) with check (public.gs_sales_is_admin() and updated_by=auth.uid());
commit;
