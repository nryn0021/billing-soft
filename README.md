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
- Local SQLite database stored on this computer and portable to a future server

## Run locally

Requirements: Node.js `22.5.0` or newer because the server uses Node's built-in SQLite driver.

```bash
npm install
npm run db:init
npm run dev
```

The app runs with:

- React/Vite client at `http://localhost:5173`
- Node API at `http://localhost:8787`
- SQLite database at `data/jmd-mill.sqlite`

For a local hosted build on this computer:

```bash
npm run build
npm start
```

Open `http://localhost:8787`. Other devices on the same network can use this computer's LAN IP and port `8787` if the firewall allows it.

## First login

Default temporary accounts are created only when the database is empty:

| Role | Username | Temporary password |
| --- | --- | --- |
| Admin | `pankaj` | `JMD@9955299279` |
| Amarpur biller | `amarpur.biller` | `Biller@2026` |
| Samukhiya biller | `samukhiya.biller` | `Biller@2026` |
| Manager | `manager` | `Manager@2026` |

Every seeded user must change the temporary password on first sign in. Passwords are stored as salted hashes, not as plain text.

## Database and backup

All live business data is in `data/jmd-mill.sqlite`; SQLite may also create `data/jmd-mill.sqlite-wal` and `data/jmd-mill.sqlite-shm` while the server is running. For a simple backup, stop the server and copy the whole `data` folder. To move to another computer/server later, copy the same folder and run the app from the new machine.

## Verification

Use these checks before using a new build:

```bash
npm run lint
npm run build
```

## Production notes

The CD rule is represented exactly as requested, but it should be validated with the company's accountant before production use.

Before exposing the app outside the local network, add HTTPS, firewall/VPN rules, automated encrypted backups and accountant-approved tax/GST fields.
