-- Golden Star V37: spice picker corrections. Safe to rerun; no deletes.
-- All assignments are SKU-specific; no existing product names/Arabic/barcodes altered.
BEGIN;
UPDATE public.gs_sales_products SET pick_category='SPICES', spice=true
WHERE btrim(sku) IN ('11214','11269','11191','11663','11660');
UPDATE public.gs_sales_products SET pick_category='GROCERY', spice=false
WHERE btrim(sku)='11456';
-- Conservative initial classification: packaged dry lentils, bulgur, cracked wheat,
-- dry broad/fava beans, slivered almonds, and pitted prunes. Only NULL categories
-- are populated so earlier manually selected categories stay untouched.
UPDATE public.gs_sales_products
SET pick_category='SPICES', spice=true
WHERE pick_category IS NULL
 AND lower(coalesce(name,'')) ~ '(lentils?|bulgur|burghul|cracked wheat|gerish|jareesh|dry (broad |fava |white |red |black |kidney |pinto )?beans?|fava beans?|broad beans?|slivered almond|almonds? (sliced|slivered)|prunes? (pitted|dried))'
 AND lower(coalesce(name,'')) ~ '([0-9]+([.][0-9]+)?[[:space:]]*(oz|g|gr|gram|grams|kg|lb|lbs)|bag|packed)'
 AND lower(coalesce(name,'')) !~ '(canned|tin|ready to eat|cooked|frozen|soup|drink|juice|sauce|paste|instant|rice|flour)'
 AND btrim(coalesce(sku,'')) <> '11456';
COMMIT;
SELECT sku,name,pick_category,spice FROM public.gs_sales_products
WHERE btrim(sku) IN ('11214','11269','11191','11663','11660','11456') ORDER BY sku;
