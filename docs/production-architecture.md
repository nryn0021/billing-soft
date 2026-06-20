# Local and Production Architecture

The application now runs as a local Node.js API plus React client with SQLite as the source of truth. This is suitable for hosting on the office computer first, then moving the `data` folder to a stronger machine or server later. A future multi-site internet deployment can migrate the same domain model to PostgreSQL.

## Current local shape

- React/Vite client for the billing, reports and admin screens
- Node.js HTTP API serving `/api/*` and the production static build
- SQLite database at `data/jmd-mill.sqlite`
- Server-side sessions stored as hashed tokens with HttpOnly cookies
- CSRF protection for mutating requests
- Role checks enforced in the API for admin, manager and biller access
- Atomic database transactions for bill posting, stock updates, payments, ledger entries and audit records

## Future server shape

- React/Vite client deployed behind HTTPS
- Node.js API with the same route boundaries and validation rules
- PostgreSQL if multiple machines need concurrent internet access
- Automated encrypted backups and restore tests
- Object storage for generated invoice PDFs and supporting documents
- VPN/private network access for offices before any public internet exposure

## Core tables

- `branches`: business locations and invoice prefixes
- `users`: identity, salted password hashes, role and branch scope
- `sessions`: hashed session tokens and CSRF tokens
- `parties`: customer/supplier identity, address, phone, encrypted bank account, IFSC and running balance
- `products`: grain catalog, English/Hindi names, effective base prices and current stock
- `bills`, `bill_lines`: immutable sale/purchase headers and line items
- `payments`: cash/bank/split payments applied to bills
- `ledger_entries`: party balances derived from posted bills and payments
- `stock_movements`: signed quantity movements per product, branch and bill
- `audit_events`: actor, action, before/after values, branch, timestamp and request ID
- Future `opening_balances`: dated imports for initial stock and party balances

Money is stored as integer paise, and weight is stored as integer grams. Do not persist binary floating-point values for financial totals.

## Access rules

| Action | Admin | Manager | Biller |
| --- | --- | --- | --- |
| View assigned branches | Yes | Yes | Yes |
| Create sale/purchase bills | Yes | No | Yes |
| Edit or cancel posted bills | Yes, audited | No | No |
| View reports and ledgers | Yes | Yes | Assigned branch |
| Change daily base rates | Yes | Yes | No |
| Override rate while billing | Yes | No | Yes, audited |
| Manage users and branches | Yes | No | No |

## Posting a bill

One database transaction should:

1. Start an immediate database transaction and read the current product rate and stock row.
2. Convert the entered unit to kilograms and calculate gross, deduction, net, paid and due values.
3. Create the bill and bill lines.
4. Create the signed stock movement: purchase adds stock, sale removes stock.
5. Create payment and party ledger entries.
6. Record any rate override and its reason.
7. Commit all records together, or roll everything back on failure.

Posted bills should not be silently edited. Corrections should use cancellation or reversal records so the audit history remains intact.

## Reporting

Reports should query posted bills, payments and stock movements by branch and timezone. Provide presets for day, week, month, quarter, calendar year and Indian financial year, plus CSV/PDF export. Opening balances must use an effective date so historical reports remain reproducible.

## Portability

For local use, stop the server and copy the whole `data` folder to back up or move the installation. This includes `jmd-mill.sqlite` and `.jmd-secret`, which is required to decrypt saved bank account numbers. If the server is running, copy `jmd-mill.sqlite`, `jmd-mill.sqlite-wal`, `jmd-mill.sqlite-shm` and `.jmd-secret` together. A later PostgreSQL migration should export/import branches, products, parties, bills, bill lines, payments, stock movements, ledger entries, audit events and users.

## Before launch

- Confirm invoice fields, GST treatment, CD deduction rules and cash-payment compliance with the company's accountant.
- Keep bank account encryption keys in protected backups and restrict decrypted access.
- Add automated backup scheduling and restore drills.
- Use HTTPS and a VPN/firewall before any office access over the internet.
- Test concurrent billing, stock-underflow prevention, backup restore and invoice number uniqueness.
