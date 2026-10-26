GOLDEN STAR V40 — MOBILE ARABIC NAME EDITOR

BASED ON: your exact V39 Admin Category Review ZIP. All V39 source files retained unchanged.
SOURCE LIST: 524 products / Product ID values from your No Spices Review sheet.

1. In Supabase SQL Editor, run V40_RUN_IN_SUPABASE_FIRST.sql (once).
2. Under Supabase Authentication > Users, invite/create an account for your employee using her email (does not require Google account).
3. Edit and run the commented employee access INSERT in V40_RUN_IN_SUPABASE_FIRST.sql with the exact employee email. This grants Arabic-review-only access, not salesman/admin role.
4. Deploy this entire ZIP to Netlify over the current V39 website.
5. Open https://YOUR-SITE/arabic-review.html on her phone and sign in.

The review page loads the exact 524 product IDs from the workbook. Product rows currently classified SPICES will be omitted for safety. Products deleted since the workbook will not appear. New products added after the workbook will not be included unless its ID is added to arabic-review-ids.json.

Only field updated: public.gs_sales_products.arabic via a restricted Supabase RPC. Existing English names, SKU, GTIN, categories, invoice logic, orders and salesman screen are unchanged. Previous Arabic values are kept in gs_arabic_review_history for audit.

NOTE: A corrected name appears on new/loaded live product data after the salesperson refreshes. Previously saved invoice/order item snapshots may not automatically rewrite history.
