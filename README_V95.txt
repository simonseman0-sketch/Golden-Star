V95 Meijer/Nino mandatory invoice-group correction

For Meijer/Nino: SKUs 12044 (Angel Hair) and 11546 (Dubai Chocolate) always share Dubai + Angel Hair invoice. Drops 44537-44541 always share their separate Drops invoice. A Grocery invoice is only created if actual Grocery lines exist. Current saved product names, prices, packing template, printing, and QuickBooks numbering unchanged.

This corrects both newly prepared orders and saved orders when loaded in Salesman Portal or Route Manager. Existing downloaded PDFs must be regenerated. No Supabase SQL required.
