Golden Star Sales Hub — Invoice Break

- Add products to Invoice 1.
- Click + Invoice Break next to + Item not listed.
- All subsequently added items go into Invoice 2 (and so on).
- Main printed order groups items by invoice with CREATE SEPARATE INVOICE instruction.
- Second printed spice picking sheet groups spices by invoice.
- The single Supabase order record stores invoice_group in each item's items JSON.
- This does not automatically create separate accounting invoices in QuickBooks.
- Existing saved drafts and orders default to invoice group 1.
- No SQL migration required, assuming gs_sales_orders.items is jsonb.

Please test by submitting and reprinting a two-group order before using in production.
