-- Golden Star V38: recategorize ALL prepackaged 10 LB items to Grocery.
-- Run in Supabase SQL Editor AFTER V37. No rows deleted, product names/SKUs untouched.
-- This intentionally overrides prior SPICES flags for 10 LB packaged goods.
BEGIN;
UPDATE public.gs_sales_products
SET pick_category='GROCERY', spice=false
WHERE lower(coalesce(name,'')) ~ '(^|[^[:alnum:]_])10[[:space:]]*(lb|lbs|pound|pounds)([^[:alnum:]_]|$)'
   OR btrim(coalesce(sku,'')) IN ('11276','11272','11273');
COMMIT;
-- Review every matched 10 LB SKU and its resulting category.
SELECT sku,name,pick_category,spice FROM public.gs_sales_products
WHERE lower(coalesce(name,'')) ~ '(^|[^[:alnum:]_])10[[:space:]]*(lb|lbs|pound|pounds)([^[:alnum:]_]|$)'
   OR btrim(coalesce(sku,'')) IN ('11276','11272','11273')
ORDER BY name,sku;
