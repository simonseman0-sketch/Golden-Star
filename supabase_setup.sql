-- Golden Star Warehouse Order Desk V5
-- Run in your existing Supabase project's SQL editor.
-- Sign-in users via Supabase Authentication, then assign admin roles manually.
create table if not exists public.gs_warehouse_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check (role in ('admin','sales')) default 'sales'
);
create table if not exists public.gs_warehouse_products (
 product_key text primary key,
 en text not null,
 sku text not null default '',
 ar text not null default '',
 category text not null default 'Other',
 approved_by uuid references auth.users(id),
 updated_at timestamptz not null default now()
);
create table if not exists public.gs_warehouse_proposals (
 id bigint generated always as identity primary key,
 product_key text not null,
 en text not null,
 sku text not null default '',
 ar text not null default '',
 category text not null default 'Other',
 change_type text not null check(change_type in ('translation','product')),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 submitted_by uuid not null default auth.uid() references auth.users(id),
 submitted_at timestamptz not null default now(),
 decided_by uuid references auth.users(id),
 decided_at timestamptz
);
create or replace function public.gs_warehouse_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.gs_warehouse_roles r where r.user_id=(select auth.uid()) and r.role='admin');
$$;
revoke all on function public.gs_warehouse_is_admin() from public;
grant execute on function public.gs_warehouse_is_admin() to authenticated;
alter table public.gs_warehouse_roles enable row level security;
alter table public.gs_warehouse_products enable row level security;
alter table public.gs_warehouse_proposals enable row level security;
-- Signed-in warehouse employees may read the shared approved dictionary.
create policy "warehouse_roles_own_or_admin_read" on public.gs_warehouse_roles for select to authenticated using (user_id=(select auth.uid()) or public.gs_warehouse_is_admin());
create policy "warehouse_approved_read" on public.gs_warehouse_products for select to authenticated using (true);
create policy "warehouse_approved_admin_insert" on public.gs_warehouse_products for insert to authenticated with check(public.gs_warehouse_is_admin() and approved_by=(select auth.uid()));
create policy "warehouse_approved_admin_update" on public.gs_warehouse_products for update to authenticated using(public.gs_warehouse_is_admin()) with check(public.gs_warehouse_is_admin() and approved_by=(select auth.uid()));
create policy "warehouse_proposals_read" on public.gs_warehouse_proposals for select to authenticated using(submitted_by=(select auth.uid()) or public.gs_warehouse_is_admin());
create policy "warehouse_proposals_insert" on public.gs_warehouse_proposals for insert to authenticated with check(submitted_by=(select auth.uid()) and status='pending' and decided_at is null and decided_by is null);
-- All decisions must happen via a transaction-safe database function.
create or replace function public.gs_warehouse_decide(p_id bigint, p_approve boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare proposal public.gs_warehouse_proposals%rowtype;
begin
 if not public.gs_warehouse_is_admin() then raise exception 'Admin required'; end if;
 select * into proposal from public.gs_warehouse_proposals where id=p_id for update;
 if not found then raise exception 'Proposal not found'; end if;
 if proposal.status <> 'pending' then raise exception 'Already reviewed'; end if;
 if p_approve then
  insert into public.gs_warehouse_products(product_key,en,sku,ar,category,approved_by,updated_at)
  values(proposal.product_key,proposal.en,proposal.sku,proposal.ar,proposal.category,(select auth.uid()),now())
  on conflict(product_key) do update set en=excluded.en,sku=excluded.sku,ar=excluded.ar,category=excluded.category,approved_by=excluded.approved_by,updated_at=now();
 end if;
 update public.gs_warehouse_proposals set status=case when p_approve then 'approved' else 'rejected' end,
 decided_by=(select auth.uid()),decided_at=now() where id=p_id;
end$$;
revoke all on function public.gs_warehouse_decide(bigint,boolean) from public;
grant execute on function public.gs_warehouse_decide(bigint,boolean) to authenticated;
-- First create a login under Authentication > Users, then grant its UUID admin role:
-- insert into public.gs_warehouse_roles(user_id,role) values ('PASTE-USER-UUID-HERE','admin') on conflict(user_id) do update set role='admin';
-- Other signed-in users can submit proposals without a role row; add 'sales' if desired.
-- IMPORTANT: enable Supabase email confirmation or invite-only accounts; never publish service_role keys.
