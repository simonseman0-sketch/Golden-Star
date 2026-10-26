Golden Star V38 — 10 LB grocery correction

1. If V37 SQL has not been executed, run V37_RUN_IN_SUPABASE_FIRST.sql first.
2. Run V38_RUN_IN_SUPABASE_FIRST.sql in Supabase SQL Editor. This reclassifies ALL products with 10 LB / 10 LBS / 10 POUND(S) names, plus SKUs 11276, 11272, 11273, to GROCERY and spice=false.
3. Deploy all V38 website files (replacing V37) and refresh the browser.
4. Verify the SQL SELECT result and print a Kroger full order + Spices sheet. 10 LB bags should remain in Grocery and be absent from Spices. Smaller bags continue to follow saved categories.

No database has been modified by packaging this ZIP; you must run the SQL.
