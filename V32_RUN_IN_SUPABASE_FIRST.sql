-- Golden Star V32 picking categories. Run in Supabase SQL Editor before deploying V32.
-- Does NOT drop/recreate tables or overwrite names, SKU, translations, or other edits.
BEGIN;
ALTER TABLE public.gs_sales_products ADD COLUMN IF NOT EXISTS pick_category text;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='gs_sales_products_pick_category_valid' AND conrelid='public.gs_sales_products'::regclass) THEN
 ALTER TABLE public.gs_sales_products ADD CONSTRAINT gs_sales_products_pick_category_valid CHECK (pick_category IS NULL OR pick_category IN ('FROZEN','DAIRY','GROCERY','SPICES'));
 END IF;
END$$;
-- Assign known frozen brands; never replace categories already manually assigned.
UPDATE public.gs_sales_products SET pick_category='FROZEN'
WHERE pick_category IS NULL AND (
 lower(coalesce(brand,'')) LIKE '%mosul kubba%' OR lower(coalesce(brand,'')) LIKE '%gourme%'
 OR lower(coalesce(name,'')) LIKE 'mosul kubba %' OR lower(coalesce(name,'')) LIKE 'gourme %'
);
-- Preserve existing spice flags when assigning initial categories.
UPDATE public.gs_sales_products SET pick_category='SPICES'
WHERE pick_category IS NULL AND spice IS TRUE;
-- Unknown items remain NULL rather than silently assigning an unverified category.
CREATE OR REPLACE FUNCTION public.gs_admin_save_product(item_id bigint,payload jsonb)
RETURNS SETOF public.gs_sales_products
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE saved public.gs_sales_products%ROWTYPE;
DECLARE nm text := nullif(btrim(payload->>'name'),'');
DECLARE sk text := nullif(btrim(payload->>'sku'),'');
DECLARE bar text := nullif(btrim(payload->>'gtin'),'');
DECLARE cat text := nullif(upper(btrim(payload->>'pick_category')),'');
BEGIN
 IF auth.uid() IS NULL OR NOT EXISTS (
   SELECT 1 FROM auth.users u JOIN public.gs_sales_staff s ON s.user_id=u.id
   WHERE u.id=auth.uid() AND lower(u.email)='simon@goldenstarwholesale.net'
     AND s.enabled IS TRUE AND s.role='admin'
 ) THEN RAISE EXCEPTION 'Admin permission required' USING ERRCODE='42501'; END IF;
 IF cat IS NOT NULL AND cat NOT IN ('FROZEN','DAIRY','GROCERY','SPICES') THEN RAISE EXCEPTION 'Invalid picking category'; END IF;
 IF nm IS NULL THEN RAISE EXCEPTION 'English product name is required'; END IF;
 IF item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.gs_sales_products WHERE id=item_id)
 THEN RAISE EXCEPTION 'Product not found'; END IF;
 IF sk IS NOT NULL AND EXISTS (SELECT 1 FROM public.gs_sales_products WHERE sku=sk AND (item_id IS NULL OR id<>item_id))
 THEN RAISE EXCEPTION 'SKU already belongs to another product: %',sk; END IF;
 IF bar IS NOT NULL AND EXISTS (SELECT 1 FROM public.gs_sales_products WHERE gtin=bar AND (item_id IS NULL OR id<>item_id))
 THEN RAISE EXCEPTION 'Barcode already belongs to another product: %',bar; END IF;
 IF item_id IS NULL THEN
  INSERT INTO public.gs_sales_products(name,arabic,sku,gtin,brand,spice,pick_category,sku_status,origin,created_by)
  VALUES(nm,nullif(btrim(payload->>'arabic'),''),sk,bar,nullif(btrim(payload->>'brand'),''),coalesce((payload->>'spice')::boolean,false),cat,'manual_unverified','Admin addition',auth.uid())
  RETURNING * INTO saved;
 ELSE
  UPDATE public.gs_sales_products SET name=nm,arabic=nullif(btrim(payload->>'arabic'),''),sku=sk,gtin=bar,
   brand=nullif(btrim(payload->>'brand'),''),spice=coalesce((payload->>'spice')::boolean,false),pick_category=cat
  WHERE id=item_id RETURNING * INTO saved;
 END IF;
 RETURN NEXT saved;
END $$;

REVOKE ALL ON FUNCTION public.gs_admin_save_product(bigint,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.gs_admin_save_product(bigint,jsonb) TO authenticated;
COMMIT;
-- Review unassigned items in the Admin Portal or here:
SELECT COUNT(*) AS unassigned_products FROM public.gs_sales_products WHERE pick_category IS NULL;
