# Production upgrade runbook

## Scope and architecture

`public/` is the frontend; `server.js` and `src/` are the backend; `src/migrations/` defines PostgreSQL storage. Run one application origin so cookie authentication, admin UI and APIs stay same-origin. Property membership is checked from the database on each request. Lists and record writes apply the selected property and the signed-in user's assignments.

Implemented workflows: owner registration with atomic property creation; additional properties; unit details and photos; date availability and seasonal rates; private booking management; property-scoped tenants, monthly leases and rent ledger; website drafts, preview, version conflict detection, publication and unpublication; manager invitations and revocation; encrypted property-specific Daraja credentials; durable payment reconciliation.

## Before upgrading an existing installation

1. Take a database backup and prove it restores to a separate environment. Preserve the old application release. Do not run seeds on a production database.
2. Rehearse all migrations against a restored copy. Resolve case-insensitive duplicate usernames/emails before migration 019. Check that contract/deposit property IDs exist and match their units. Review tenants with no contracts/deposits: migration cannot infer their property; they remain visible only to a platform administrator until assigned by a reviewed database maintenance operation.
3. Migration 018 splits tenants shared across properties and repoints contracts, payments and deposits without discarding their history. Review counts and relationship consistency after migration. No automatic destructive down migration is provided for 018 or 019; rollback means restoring the tested backup and previous release together.
4. Stop accepting payments on the old application and allow in-flight STK requests to finish. Reconcile pending/ambiguous transactions against the merchant statement before cutover. Historical callbacks and legacy JWTs do not transfer to the new protocol; the old unscoped callback route intentionally returns 404.
5. Existing sites are backfilled as published snapshots to preserve their visibility. Existing assignments become managers, not owners. Sign in as the platform administrator and designate each property's owner. Confirm account recovery access before closing the upgrade window.
6. Historical rental deposits have no reliable rent/security/utilities breakdown. Migration 019 leaves their snapshots null. Do not infer or automatically reallocate those historical amounts. Review them against the original agreements and statements.

## Runtime configuration

- Use Node.js 24 and PostgreSQL 16+. Run `npm ci --omit=dev` and `npm run migrate:latest` as a release step, then `npm start`. Do not migrate concurrently from every application replica.
- Set `NODE_ENV=production`, `DATABASE_URL`, and the exact HTTPS `SITE_ORIGIN` without a trailing slash. The database connection should use the hosting provider's verified TLS configuration; do not disable certificate checks.
- Set `CREDENTIAL_ENCRYPTION_KEY` to 64 hex characters generated from 32 random bytes. Keep it in a secret manager and back it up separately. Losing or replacing it makes existing merchant credentials unreadable. Key rotation requires a planned decrypt/re-encrypt operation; it is not automatic.
- Configure `TRUST_PROXY` only for the actual proxy CIDRs. Never blindly trust every forwarded address. Rate counters are database-backed, so they apply across replicas; wrong proxy settings can put all users in one bucket or permit spoofing.
- Expose the application through HTTPS, with request/body/time limits and database network restrictions at the infrastructure layer. Production cookies are Secure, HttpOnly and SameSite=Strict.
- `/health` checks the process; `/ready` checks database access and the workspace schema. Readiness should gate traffic. Logs include a request ID and error category, not request bodies or merchant secrets.
- Monitor error rates, database/pool capacity, callback failures and `payment_attempts.status = 'needs_review'`. The embedded maintenance loop retries durable callbacks every 30 seconds while the server runs. Multiple replicas can query the same attempt; transaction locks prevent duplicate financial writes.
- Back up the database regularly and test restores. The application does not provision backup infrastructure, domains, TLS or provider accounts.

## Payment acceptance checks in staging

Configure each property's own sandbox merchant account. Verify the callback origin is publicly reachable over HTTPS. The callback token is generated internally and sent to Daraja with the STK request; do not expose it in public logs.

Exercise successful B&B and rental payments, wrong PIN/cancellation, insufficient funds, timeout, missing/late/duplicate callbacks, repeated submit, amount mismatch and dates taken before a delayed payment arrives. Check the actual merchant statement and database ledger. Verify a second property's owner cannot inspect the first property's payment records or credentials.

A callback alone never confirms payment. Confirmation requires a successful authenticated STK query and matching callback amount, phone and receipt. Provider-query disagreement, missing callbacks, ambiguous transport failures and late reservation conflicts require investigation. Check the statement before refunding or recording an adjustment. Never blindly replay a charge or manually mark an M-Pesa booking paid to clear an error. Provider refunds/reversals and statement imports are not implemented.

For a rental move-in payment, verify security deposit and utilities remain separate from first-month rent. Leases use full monthly amounts, with no automatic proration, tax calculation or overpayment carry-forward. Financial lease terms cannot be edited retrospectively; end the lease and create a new agreement for a change. Manual payments support partial payments and retain a ledger entry per request.

Enable live payments only after the property's production Daraja account and these checks have been completed. Credentials and actual live transactions were not available during branch development.

## UI and operational acceptance

Review desktop and mobile views of the existing homepage and admin dashboard, then onboard a new property, add/edit a studio and its photos, create a tenant/lease, record rent, edit and preview a website, publish, make another draft and unpublish. Verify unsaved-change prompts, keyboard navigation, property switching, empty/error states, invitation acceptance and immediate revocation. Test two managers editing the same website: the second stale save must get a conflict rather than overwrite changes.

Original CSS was extracted without redesigning it. New screens reuse its colour and typography tokens. Automated DOM tests cover selected forms and text escaping. A live browser preview was blocked in the development environment, so visual acceptance remains a release gate rather than a claimed pass.

Known boundaries: CMS images are HTTPS URLs, not uploads; property URLs are `/p/<slug>`, not custom domains; guest enquiries use contact links, not a lead inbox; automatic messaging and physical-device integrations are unavailable; self-service password recovery and email verification are unavailable. Static marketing copy on the platform homepage remains platform-owned. A property's own website content is editable in its workspace.

## Verification evidence

Run `npm run check`, `npm test` and `npm audit --omit=dev --audit-level=moderate`. Integration tests run real Express routes against a disposable database and mock only the payment provider transport. Tests cover tenant isolation, auth, publication boundaries, invitations, booking overlap/pricing, rent retry safety, deposit allocation and replay-resistant payment reconciliation. CI uses actual PostgreSQL 16; local default tests use PGlite and do not prove multi-process database behaviour.

Review the GitHub Actions result for the final commit, not an earlier version. Do not merge or deploy solely because a production-readiness branch exists.
