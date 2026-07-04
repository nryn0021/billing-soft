# Jai Mata Di Gud Mill

A local-first billing and inventory workspace for Jai Mata Di Gud Mill.

## Current features

- Sale and purchase bills with printable invoice/voucher output
- Kilogram, quintal and tonne conversion, normalized to kilograms
- Per-kilogram base rates with bill-level overrides and an audit trail
- Configurable 2.5% CD deduction on eligible purchase bills above INR 20,000
- Cash, online, split and credit payments with outstanding dues
- Debtor and creditor party ledgers
- Grain inventory updated by each sale or purchase
- Daily rate book for rice varieties, wheat, moong, khesari and maize
- Branch filtering for Amarpur and Samukhiya offices
- Role-based login for admin, manager and biller users
- Full-screen biller workspace with party search, automatic party creation and built-in calculator
- Party bank account and IFSC fields for vouchers and future payments
- Hindi grain names shown beside English names
- Multi-tenant PostgreSQL backend (Drizzle ORM) with strict per-tenant data isolation
- UUID primary keys with the readable IDs (`PTY-1001`, `SAL-AMP-0001`) preserved as `display_id`

## Deploy with Docker (mini-server)

The fastest way to run the full stack (app + PostgreSQL 16):

```bash
cp .env.example .env          # then set JMD_DATA_SECRET and change the passwords
docker compose up --build
```

Open `http://localhost:8787`. On first boot the app container pushes the schema
(`drizzle-kit push`) and seeds the default tenant. Data persists in the
`jmd_pgdata` Docker volume.

## Run locally (without Docker)

Requirements: Node.js `22.5.0`+ and a reachable PostgreSQL 16 database.

```bash
npm install
cp .env.example .env          # set DATABASE_URL + JMD_DATA_SECRET
npm run db:init               # drizzle-kit push + seed the default tenant
npm run dev
```

The app runs with:

- React/Vite client at `http://localhost:5173`
- Node API at `http://localhost:8787`
- PostgreSQL as configured by `DATABASE_URL`

For a local hosted build:

```bash
npm run build
npm start
```

Useful scripts: `npm run db:push` (sync schema), `npm run db:seed` (seed data),
`npm run db:generate` (emit versioned SQL migrations when you adopt them).

## First login

Sign in with the **mill code** (tenant slug) plus a username. The default tenant
is seeded as `jmd`. Temporary accounts are created only when the tenant has no users:

| Role | Mill code | Username | Temporary password |
| --- | --- | --- | --- |
| Admin | `jmd` | `pankaj` | `JMD@9955299279` |
| Amarpur biller | `jmd` | `amarpur.biller` | `Biller@2026` |
| Samukhiya biller | `jmd` | `samukhiya.biller` | `Biller@2026` |
| Manager | `jmd` | `manager` | `Manager@2026` |

Every seeded user must change the temporary password on first sign in. Passwords are stored as salted scrypt hashes, not as plain text.

## Database and backup

Business data lives in PostgreSQL. Bank account numbers are encrypted at the
application layer with AES-256-GCM using `JMD_DATA_SECRET` (or `data/.jmd-secret`
when the env var is unset). **Back up that secret separately** — without it,
encrypted bank details cannot be decrypted.

Back up the database with `pg_dump` (or the managed provider's snapshots), e.g.:

```bash
docker compose exec db pg_dump -U jmd jmd_mill > backup.sql
```

## Verification

Use these checks before using a new build:

```bash
npm run lint
npm run build
```

## Production notes

The CD rule is represented exactly as requested, but it should be validated with the company's accountant before production use.

Before exposing the app outside the local network, add HTTPS, firewall/VPN rules, automated encrypted backups and accountant-approved tax/GST fields.
