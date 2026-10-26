GOLDEN STAR WAREHOUSE ORDER DESK V5 – SHARED TEAM EDITION

SETUP
1. Open your Supabase project -> SQL Editor. Run supabase_setup.sql.
2. In Supabase Authentication -> Users, invite/create salesmen using email + password.
3. To designate an admin, find their auth.users UUID, and run:
   insert into public.gs_warehouse_roles(user_id, role)
   values ('THE-AUTH-USER-UUID', 'admin')
   on conflict(user_id) do update set role='admin';
4. Edit config.js with Supabase Project URL and the PUBLIC publishable/anon key.
   Do NOT use a service_role or secret key.
5. Deploy index.html, app.js, shared.js, config.js, styles.css, products.json to Netlify.
   You can drag the V5 zip contents as a folder into Netlify's deploy screen.
6. Sign in on each staff device. Approved dictionary changes sync on sign-in, with a
   manual Refresh button and background refresh approximately every 60 seconds.

IMPORTANT
- The 201 bundled product translations are still provisional until validated by staff.
- New translation edits are LOCAL immediately, and proposed for admin approval on change.
- An admin approval writes to a shared Supabase table; staff sync the approved record.
- Locally added products must be explicitly submitted for approval.
- Order text (names, addresses, phone numbers, items) is not uploaded to Supabase by this V5 sync feature.
- Existing product backups/corrections remain local browser features.
- Test with real orders before production. Product matching remains rule-based and can be uncertain.
- Authentication is through Supabase; do not enable public signups for a staff-only portal.
- For tighter access, restrict product read/proposal insert to registered staff roles via RLS.
