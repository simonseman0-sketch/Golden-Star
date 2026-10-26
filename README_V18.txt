V18 — Remember confirmed product aliases

Fix: Confirm & Save stores both canonical product and actual salesperson shorthand as separate searchable keys in existing Supabase product dictionary. Subsequent conversions use the shorthand as an exact match, removing repeated approximate-match warnings. Shared across devices after sync.

No SQL migration beyond V17 required. The database must already have gs_warehouse_save_now function from V17, anonymous auth enabled, and successful shared save. If these are not in place the portal shows save errors.

To test: enter Pomegranate molasses plastic .1 -> review -> Confirm & Save -> Start Over -> paste identical line -> Convert. No approximate-match warning should appear. On a second device, click Refresh shared translations before converting.

Safety: Unverified AI translation suggestions remain unapproved. Existing synonyms may still need their own confirmation. Anyone with access to the anonymous site may submit changes (existing V17 security model).
