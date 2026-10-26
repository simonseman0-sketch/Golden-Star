V90 — Original print-template PDF sharing

Unlike prior browser canvas attempts, this build uses a Netlify Function with headless Chromium print-to-PDF. Both Print List and the shared file are rendered from the same makePrintMarkup() output and salesman.css print styles.

DEPLOYMENT NOTES:
1. Deploy as a Netlify SITE PROJECT / Git-based deployment with npm dependency installation and Functions building enabled. Drag-and-drop static ZIP deploy alone does NOT install Chromium or deploy the function.
2. Supabase URL and publishable key are inherited from the existing website config; Netlify SUPABASE_URL / SUPABASE_ANON_KEY environment variables can override them if needed.
3. Confirm /.netlify/functions/warehouse-pdf is deployed.
4. On iPhone, sign in and test an order against Print List before sending.
5. Direct share uses the iOS file share sheet with the named PDF.

Old browser-generated PDF remains in source for reference but is NOT called in the share workflow. The original Print List function is unchanged. No Supabase migrations.
