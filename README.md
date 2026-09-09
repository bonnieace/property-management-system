# Property Management System

This repository contains **both the frontend and backend**. Express serves the existing HTML/CSS/JavaScript frontend and a PostgreSQL API in one application. No separate frontend repository or build service is required.

Property owners can create an account and property at `/onboard.html`, then use `/admin/` to manage units, pricing, availability, bookings, tenants, leases, rent payments and their website. Each property has its own workspace and public URL at `/p/<property-id>`.

## Run locally

Use Node.js 24 and PostgreSQL 16 or newer.

```sh
npm ci
cp .env.example .env
# Set DATABASE_URL for a local development database.
npm run migrate:latest
npm start
```

Open `http://localhost:4000/onboard.html`. New properties start with a private website draft. In **Property workspace → Website**, add content and an HTTPS cover photo, save, preview and publish. Add rooms under **Units & Rooms**; edit a room to manage its photo URLs. Room availability and prices are live operational data, independent of website draft versions.

The existing cream, charcoal and earth palette, display typography, room cards and dashboard layouts are retained. Their original inline styles live in `public/css/site.css` and `public/css/admin.css`; new workspace styles extend them.

## Property and platform access

- Owners manage their property, website, team invitations and M-Pesa settings.
- Invited managers manage assigned properties and websites. They cannot change merchant credentials, invite other managers, or administer the platform.
- Platform administrators manage accounts and assignments. On a fresh database, set the four `BOOTSTRAP_*` variables and run `npm run admin:bootstrap` once. This refuses to run if a platform administrator already exists. Remove those variables afterward.
- Existing property administrators retain their assignments after migration. A platform administrator must grant **Owner** access to the appropriate person under **Admin Users → Assign Properties**.
- Sessions use HttpOnly cookies. Password changes revoke other sessions; account deactivation and assignment revocation apply to the next request. Old JWT sessions are deliberately invalidated.

Owners can create another property under **Properties**. Use the header selector to switch workspaces. Invitations generate a private, single-use link valid for 48 hours; the owner shares it with the intended person. The application does not send email on their behalf.

## Payments

Set a persistent `CREDENTIAL_ENCRYPTION_KEY` and the public HTTPS `SITE_ORIGIN`, then configure each property's Daraja credentials in **Property workspace → M-Pesa**. Secrets are encrypted at rest and are never returned to the dashboard. Shared `MPESA_*` environment variables from the previous application are no longer used by the payment routes.

Amounts are calculated by the backend. Requests and rent ledger entries are idempotent. Callbacks are persisted, then checked against an authenticated provider query before confirmation. The server runs reconciliation every 30 seconds. Mismatched, ambiguous or conflicting payments remain in **Payment activity** for investigation. Rental move-in payments separate the first month's rent, security deposit and utilities deposit; only rent is credited to the rent ledger.

Online payments remain disabled until configured. Without them, room cards offer a contact enquiry. Use sandbox credentials and complete the payment checks in [the production runbook](docs/production-readiness.md) before enabling live payments.

## Verification

```sh
npm run check
npm test
npm audit --omit=dev --audit-level=moderate
```

Tests use a disposable in-memory PostgreSQL-compatible PGlite database by default. To test real PostgreSQL, set `TEST_DATABASE_URL` to an **empty, disposable database**; tests migrate it and create synthetic records. GitHub Actions runs the suite against PostgreSQL 16. DOM tests exercise onboarding, CMS publishing, request scoping and the existing unit editor. They do not replace visual browser review or real-provider testing.

## Deployment and boundaries

Read [docs/production-readiness.md](docs/production-readiness.md) before upgrading an existing installation. Migrations 018–019 change tenant ownership and payment accounting and require a tested backup/restore plan.

Website editing supports text, amenities, policies, contact details, gallery and externally hosted HTTPS image URLs. File uploads and custom domains are not implemented. Automated SMS/email, water-tank telemetry, door access and CCTV integrations are not connected; simulated device screens are no longer loaded. Account recovery is handled by a platform administrator through account management; self-service reset email and email verification are not implemented. The branch supplies production hardening and core property workflows; it is not evidence of a completed deployment or provider certification.

Older setup documents are historical references; this README and the production runbook describe the current runtime.
