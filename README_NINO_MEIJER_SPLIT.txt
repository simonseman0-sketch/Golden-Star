BASED ON: Golden_Star_Store_Name_Packing_List_Header(1).zip (user's latest working ZIP)

ONLY MODIFIED: salesman.js, salesman.html, salesman.css. Added this README.
Original Order Translator, Packing Desk, visuals, and store autocomplete preserved.

Meijer and Nino Salvaggio stores: automatic invoice groupings by item:
Grocery, Frozen, Dubai + Angel Hair Chocolates, Pistachio Wafers.
Each populated category starts a new print/PDF page; the spice-only print remains available.
No empty invoice pages. Actual QuickBooks invoices are NOT created by this website.
Salesman can correct classification via the category selector beneath each item.
Conservative auto-classification: unrecognized products default to Grocery. Review manually.
All other store chains continue to use their existing manual Invoice Break button.

NINO STORES: Run the separate 01_NINO_STORES_IMPORT.sql in your private Supabase SQL Editor.
This import file is NOT in the public Netlify ZIP. No schema migration is required.
It won't replace existing stores and should not be put on a public website.
Verify stores and the exact invoice page separation in a test deployment before live use.
St. Clair Shores ZIP is not fully present in source QuickBooks data; verify manually.
