Golden Star V64 — Saved QuickBooks matching and manual prices
1. Run V64_RUN_IN_SUPABASE_FIRST.sql in Supabase SQL Editor.
2. Deploy the ZIP to Netlify.
3. Sign in using an enabled gs_sales_staff admin account in the QuickBooks converter (separate from customer/Arabic reviewer credentials).
4. Load a salesman PDF. Edit an item name, sales description and/or price. Click Save item + price. A price change is also saved upon leaving the field.
5. A confirmation saying Saved ... permanently to Supabase is required for cross-device persistence. Local browser storage is a backup only and can be cleared.
6. Saved manual prices take precedence over qb-prices-reviewed.json every time. Cases are order-specific and are NOT stored as product defaults. Invoices still need careful review before importing.
NOTE: Website remains an IIF file generator only. Existing accounting default Cost of Goods Sold requires accounting approval for live sales.
