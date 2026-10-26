-- RUN ONCE IN THE WAREHOUSE SUPABASE SQL EDITOR AFTER THE ORIGINAL V5 TABLE SETUP.
-- WARNING: This permits ANY authenticated session, including ANONYMOUS sessions,
-- to update shared product names. Do not publish this site to untrusted people.
-- Review Supabase logs; this is not a secret-link security boundary.
create table if not exists public.gs_warehouse_product_changes (
  id bigint generated always as identity primary key,
  product_key text not null,
  en text not null,
  sku text not null default '',
  previous_ar text,
  new_ar text not null,
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now()
);
alter table public.gs_warehouse_product_changes enable row level security;
-- Change history is deliberately only accessible via the Supabase SQL editor/admin.
create or replace function public.gs_warehouse_save_now(
 p_en text, p_sku text, p_ar text, p_category text default 'Other'
) returns void language plpgsql security definer set search_path = '' as $$
declare k text; old_ar text;
begin
 if auth.uid() is null then raise exception 'Authenticated session required'; end if;
 if length(trim(p_en)) not between 1 and 240 or length(trim(p_ar)) not between 1 and 400
    or length(coalesce(p_sku,'')) > 64 then raise exception 'Invalid product name or translation'; end if;
 k := trim(coalesce(p_sku,'')) || '|' || trim(regexp_replace(lower(trim(p_en)), '[^a-z0-9]+', ' ', 'g'));
 select ar into old_ar from public.gs_warehouse_products where product_key=k for update;
 insert into public.gs_warehouse_products(product_key,en,sku,ar,category,approved_by,updated_at)
 values (k,trim(p_en),trim(coalesce(p_sku,'')),trim(p_ar),left(coalesce(p_category,'Other'),100),auth.uid(),now())
 on conflict(product_key) do update set en=excluded.en,sku=excluded.sku,ar=excluded.ar,
 category=excluded.category,approved_by=excluded.approved_by,updated_at=now();
 insert into public.gs_warehouse_product_changes(product_key,en,sku,previous_ar,new_ar,changed_by)
 values(k,trim(p_en),trim(coalesce(p_sku,'')),old_ar,trim(p_ar),auth.uid());
end $$;
revoke all on function public.gs_warehouse_save_now(text,text,text,text) from public;
grant execute on function public.gs_warehouse_save_now(text,text,text,text) to authenticated;
