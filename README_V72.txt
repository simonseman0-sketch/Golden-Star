Golden Star V72 — Meijer invoice section parsing correction

Based on V71; no change to Salesman Portal/Load Order, Supabase, QuickBooks accounts, prices, saved overrides, or automatic IIF invoice numbering.

FIX: Recognize DUBAI + ANGEL HAIR CHOCOLATES (and related exact headings) as invoice group 3, rather than carrying forward FROZEN. The submitted Meijer #188 Livonia PDF has FOUR groups: Grocery, Frozen, Dubai + Angel Hair Chocolates (SKU 11546, 2 cases), Drops Drinks.

SKU 12012: qb-item-list.json ALREADY contains exact QB item '12012 Assorted Baklava W/Ho Win', SKU 12012, barcode 00850072422978. This is preserved.

IMPORTANT: Invoice IIF files supply invoice item names and transactions only; they DO NOT update inventory item barcode/UPC attributes in QuickBooks Desktop. The invoice's BARCODE column is generally populated from the barcode stored on the QuickBooks item itself. To permanently fix it in QuickBooks, open Lists > Item List, edit the exact item '12012 Assorted Baklava W/Ho Win', and set Barcode/UPC 00850072422978 in QuickBooks (field naming depends on custom fields and barcode settings). Save, reopen the item to verify, then test one new invoice in your backup company. This update cannot write to QuickBooks item master from the website's IIF exporter.

Test: Upload Meijer #188 order PDF. Confirm 4 separate invoices and SKU 11546 in Dubai rather than Frozen. Test export in QuickBooks backup company.
