# Database Setup Guide

## Overview

Phase 1 of the calendar system is now ready for database setup. All migrations, seeds, and configuration files have been created.

---

## Prerequisites

You need **PostgreSQL 12+** installed locally or accessible remotely.

### Option 1: Install PostgreSQL Locally (Windows)

1. Download PostgreSQL from https://www.postgresql.org/download/windows/
2. Run the installer and note down:
   - Default user: `postgres`
   - Password: _(set this yourself during installation)_
   - Port: `5432` (default)
3. After installation, PostgreSQL service should auto-start

### Option 2: Use Docker (Easier)

If you have Docker installed:

```powershell
docker run -d `
  --name nyathira-postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=nyathira_bookings `
  -p 5432:5432 `
  postgres:15-alpine
```

### Option 3: Use Cloud Database (Production)

For production, use AWS RDS, Azure Database, or similar managed services.

---

## Configuration

### 1. Create or Update `.env` File

Create a `.env` file in the project root with your database credentials:

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nyathira_bookings
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=nyathira_bookings
DATABASE_USER=postgres
DATABASE_USER_PASSWORD=postgres
```

**Notes:**
- If using Docker, user is `postgres` and password is whatever you set
- If using cloud DB, copy the connection string into `DATABASE_URL`
- Keep these credentials secure; don't commit `.env` to git

### 2. Verify PostgreSQL is Running

```powershell
# Try to connect to PostgreSQL
psql -U postgres -h localhost -d postgres -c "SELECT VERSION();"

# If successful, you'll see: PostgreSQL 15.x (or your version)
```

If connection fails:
- Check PostgreSQL service is running (Windows: Services app)
- Verify host/port/credentials in `.env`
- Try increasing connection timeout in knexfile.js

---

## Run Migrations

Once PostgreSQL is configured and running:

```powershell
# Create all tables in the database
npm run migrate:latest
```

**Expected output:**
```
Using environment: development
Batch 1, Successfully ran 7 migrations:
  001_create_units.js
  002_create_bookings.js
  003_create_availability_blocks.js
  004_create_pricing_rules.js
  005_create_waitlist.js
  006_create_admin_users.js
  007_create_audit_log.js
```

---

## Seed Initial Data

After migrations succeed, seed unit data:

```powershell
npm run seed:run
```

**Expected output:**
```
Using environment: development
✓ Seeded 9 units successfully
```

This creates:
- 3 B&B units (5 total with Kibabu)
- 6 rental units
- All in Nyathira Square and Kibabu Square

---

## Verify Database

Check that all tables and data are in place:

```powershell
# Connect to database
psql -U postgres -h localhost -d nyathira_bookings

# List all tables
\dt

# Expected tables:
#  - units
#  - bookings
#  - availability_blocks
#  - pricing_rules
#  - waitlist
#  - admin_users
#  - audit_log

# Count seeded units
SELECT COUNT(*) FROM units;  # Should return: 9

# View all units
SELECT unit_id, name, property_id, base_price_kes FROM units;

# Exit
\q
```

---

## Rollback (If Needed)

To undo all migrations:

```powershell
npm run migrate:rollback
```

To undo to a specific point:

```powershell
npm run migrate:rollback --steps=2  # Rollback last 2 migrations
```

---

## Troubleshooting

### Error: `ECONNREFUSED` when running migrations

**Cause:** PostgreSQL not running or connection details incorrect

**Solution:**
1. Start PostgreSQL service (Windows: `net start PostgreSQL15` or use Services app)
2. Verify `.env` credentials match your PostgreSQL setup
3. Check port 5432 is not blocked by firewall
4. Try connecting manually: `psql -U postgres -h localhost`

### Error: `database "nyathira_bookings" does not exist`

**Solution:** Knex will create the database automatically, but if it doesn't:

```powershell
psql -U postgres -h localhost -c "CREATE DATABASE nyathira_bookings;"
```

### Error: `password authentication failed`

**Solution:** Check the password in `.env` matches your PostgreSQL user password

### Error: `Connection timeout`

**Solution:**
- Increase timeout in `knexfile.js`:
  ```javascript
  acquireConnectionTimeout: 10000  // milliseconds
  ```
- Check firewall rules if using remote database

---

## Schema Overview

### Units Table (9 seeded records)
- B&B units: `bnb1b-nyathira`, `bnb2b-nyathira`, `bnb2b-kibabu`
- Rental units: `bedsit-nyathira`, `1bed-nyathira`, `2bed-nyathira`, `bedsit-kibabu`, `1bed-kibabu`, `2bed-kibabu`

### Bookings Table (Empty, ready for transactions)
- Linked to M-Pesa payments via `checkout_request_id`
- Indexes on dates, status, guest phone for fast queries

### Availability Blocks & Pricing Rules
- Empty, ready for admin configuration via dashboard (Phase 4)

### Waitlist, Admin Users, Audit Log
- Empty, ready for Phase 3-5 features

---

## Next Steps

After successful database setup:

1. **Phase 2**: Backend API layer
   - Create `bookingStore.js` (database version)
   - Create route handlers for calendar availability
   - Implement pricing calculator

2. **Phase 3**: Calendar components
   - Build interactive calendar widget
   - Integrate into property pages
   - Update booking modal

3. **Phase 4**: Admin dashboard
   - Admin authentication
   - Calendar management UI
   - Booking management

---

## Database Backup

To backup your database:

```powershell
# Dump schema and data
pg_dump -U postgres -h localhost -d nyathira_bookings > backup_$(Get-Date -f "yyyy-MM-dd").sql

# Restore from backup
psql -U postgres -h localhost -d nyathira_bookings < backup_2025-03-26.sql
```

---

## Questions?

Refer to:
- Knex.js docs: https://knexjs.org/
- PostgreSQL docs: https://www.postgresql.org/docs/
- `.env.example` for all configuration options
