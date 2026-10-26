V22 SALES REP ORDER HUB — PROTOTYPE

Original Order to Packing Slip website remains at index.html with only one link added.
New, independent page: salesman.html

Included: Kroger 443 starting store template, fractional quantities, custom No SKU lines,
store template importing, internal SKU CSV importing, manual mapping, local draft saving,
combined single PDF (full order then spices on separate page), browser print fallback.

PDF download uses jsPDF from a public CDN; internet is needed to load the library.
Open salesman.html via Netlify; do not assume file:// mode works.

IMPORTANT NOT INCLUDED YET:
- Salesman user accounts, Supabase shared storage, authentication, real order submission
- Shared backup of store templates (export and restore JSON manually for now)
- Reliable Arabic PDF fonts (English internal names are used on this export)
- Production integration into QuickBooks/internal ERP
This is a functional preview, not a production-ready multi-user ordering system.

INVENTORY CSV: headers SKU, Internal Name (or Item Name)
Use Office Setup to select exact matches; never automatically invent SKUs.
The spice sheet only includes items in the dedicated Spice Picking group.
