-- Golden Star V71: Secure updates to the SAME submitted order ID.
-- Run in Supabase SQL Editor before deploying V71.
-- Only enabled sales staff who originally created an order, or enabled admins, can update it.
-- It does not grant permission to change the customer, creator, order ID, or creation date.
CREATE OR REPLACE FUNCTION public.gs_sales_update_order(
 p_order_id uuid, p_items jsonb, p_delivery_note text, p_notes text
) RETURNS public.gs_sales_orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_order public.gs_sales_orders;
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.gs_sales_staff s
   WHERE s.user_id=auth.uid() AND s.enabled IS TRUE
 ) THEN RAISE EXCEPTION 'Authorized sales staff required' USING ERRCODE='42501'; END IF;
 IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
   RAISE EXCEPTION 'Order must contain at least one item'; END IF;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) x WHERE
   NULLIF(BTRIM(x->>'name'),'') IS NULL OR
   NULLIF(x->>'qty','') IS NULL OR
   (x->>'qty') !~ '^[0-9]+(\.[0-9]+)?$' OR
   (x->>'qty')::numeric <= 0 OR (x->>'qty')::numeric > 10000
 ) THEN RAISE EXCEPTION 'One or more order items are invalid'; END IF;
 UPDATE public.gs_sales_orders o SET
   items=p_items,delivery_note=COALESCE(p_delivery_note,''), notes=COALESCE(p_notes,'')
 WHERE o.id=p_order_id AND (o.created_by=auth.uid() OR EXISTS(
   SELECT 1 FROM public.gs_sales_staff s WHERE s.user_id=auth.uid()
   AND s.enabled IS TRUE AND s.role='admin'
 )) RETURNING o.* INTO v_order;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or update permission denied' USING ERRCODE='42501'; END IF;
 RETURN v_order;
END; $$;
REVOKE ALL ON FUNCTION public.gs_sales_update_order(uuid,jsonb,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gs_sales_update_order(uuid,jsonb,text,text) TO authenticated;
