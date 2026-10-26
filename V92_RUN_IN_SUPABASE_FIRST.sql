-- Golden Star V92: allow repeat IIF exports while keeping append-only audit history.
-- Run once in Supabase SQL Editor BEFORE deploying V92.
BEGIN;
CREATE TABLE IF NOT EXISTS public.gs_route_iif_export_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.gs_sales_orders(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL,
  order_hash text NOT NULL,
  exported_by uuid NOT NULL REFERENCES auth.users(id),
  exported_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS gs_route_iif_export_history_order_time_idx
  ON public.gs_route_iif_export_history(order_id, exported_at DESC);
ALTER TABLE public.gs_route_iif_export_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gs_route_iif_export_history FROM PUBLIC,anon;
GRANT SELECT ON TABLE public.gs_route_iif_export_history TO authenticated;
DROP POLICY IF EXISTS gs_route_iif_export_history_admin_read ON public.gs_route_iif_export_history;
CREATE POLICY gs_route_iif_export_history_admin_read ON public.gs_route_iif_export_history
  FOR SELECT TO authenticated USING (public.gs_sales_is_admin());
CREATE OR REPLACE FUNCTION public.gs_route_reserve_iif_export(p_order_ids uuid[],p_hashes text[])
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b uuid:=gen_random_uuid(); i integer; n integer;
BEGIN
 IF NOT public.gs_sales_is_admin() THEN RAISE EXCEPTION 'Administrator required' USING ERRCODE='42501'; END IF;
 n:=COALESCE(array_length(p_order_ids,1),0);
 IF n<1 OR n>100 OR n<>COALESCE(array_length(p_hashes,1),0) OR
    (SELECT count(DISTINCT x) FROM unnest(p_order_ids) x)<>n THEN
   RAISE EXCEPTION 'Invalid or duplicated order batch'; END IF;
 FOR i IN 1..n LOOP
   IF p_hashes[i] IS NULL OR length(p_hashes[i])<10 THEN RAISE EXCEPTION 'Missing order fingerprint'; END IF;
   IF NOT EXISTS (SELECT 1 FROM public.gs_sales_orders WHERE id=p_order_ids[i]) THEN RAISE EXCEPTION 'Order not found'; END IF;
   INSERT INTO public.gs_route_iif_export_history(order_id,batch_id,order_hash,exported_by)
   VALUES(p_order_ids[i],b,p_hashes[i],auth.uid());
 END LOOP;
 RETURN b;
END; $$;
REVOKE ALL ON FUNCTION public.gs_route_reserve_iif_export(uuid[],text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gs_route_reserve_iif_export(uuid[],text[]) TO authenticated;
COMMIT;
