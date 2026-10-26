-- Golden Star V34: Admin-only deletion of saved Sales Order Hub orders.
-- Run once in the same Supabase project before deploying V34.
-- Does not modify existing orders, items, staff, stores, or products.
CREATE OR REPLACE FUNCTION public.gs_admin_delete_sales_order(order_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE deleted_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.gs_sales_staff s ON s.user_id = u.id
    WHERE u.id = auth.uid()
      AND lower(u.email) = 'simon@goldenstarwholesale.net'
      AND s.enabled IS TRUE
      AND s.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Admin permission required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.gs_sales_orders WHERE id = order_id RETURNING id INTO deleted_id;
  IF deleted_id IS NULL THEN
    RAISE EXCEPTION 'Order not found. It may already have been deleted.';
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.gs_admin_delete_sales_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.gs_admin_delete_sales_order(uuid) TO authenticated;
