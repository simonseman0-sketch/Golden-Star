Golden Star V39 — Admin Classification Review

Deploy website files from this ZIP over V38. No additional SQL is required if V32/V38 SQL migrations have already been applied.

Admin > Manage Products:
- Shows actual saved picking category next to every product.
- Counts by category, searches, filters, and pages through ALL products (75/page; none silently dropped).
- Change a category on a row, then click Save. Saves directly using the existing admin-only Supabase RPC.
- A save synchronizes the legacy spice checkbox flag: SPICES=true, others=false.
- Full product editor remains available by clicking the product name.

NOTE: Existing 10 LB protective rules in Kroger picking and spice PDF remain intact. Changing a category to SPICES for a 10 LB packaged item will not override that safety rule.
