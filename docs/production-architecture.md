# Production Architecture

The React application is currently a local-first prototype. A production deployment should keep calculation and permission rules on the server and use PostgreSQL as the source of truth.

## Recommended shape

- React/Vite client, deployed over HTTPS
- Node.js API with schema validation and database transactions
- PostgreSQL with automated encrypted backups
- Object storage for generated invoice PDFs and supporting documents
- Server-side sessions or short-lived access tokens with refresh-token rotation

## Core tables

- `branches`: business locations and invoice prefixes
- `users`, `roles`, `user_branches`: identity and branch-scoped permissions
- `parties`, `party_bank_accounts`: customer/supplier identity, address and encrypted banking data
- `products`, `product_rates`, `rate_audit`: grain catalog, effective base prices and changes
- `bills`, `bill_lines`: immutable sale/purchase headers and line items
- `payments`, `payment_allocations`: cash/bank/split payments applied to bills
- `ledger_entries`: double-entry party balances derived from posted bills and payments
- `stock_movements`: signed quantity movements per product, branch and bill
- `audit_events`: actor, action, before/after values, branch, timestamp and request ID
- `opening_balances`: dated imports for initial stock and party balances

Store money as fixed-precision decimal or integer paise, and weight as fixed-precision kilograms. Never use binary floating-point values for persisted financial totals.

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

1. Lock and read the current product rate and relevant stock rows.
2. Convert the entered unit to kilograms and calculate gross, deduction, net, paid and due values.
3. Create the bill and bill lines.
4. Create the signed stock movement: purchase adds stock, sale removes stock.
5. Create payment and party ledger entries.
6. Record any rate override and its reason.
7. Commit all records together, or roll everything back on failure.

Posted bills should not be silently edited. Corrections should use cancellation or reversal records so the audit history remains intact.

## Reporting

Reports should query posted bills, payments and stock movements by branch and timezone. Provide presets for day, week, month, quarter, calendar year and Indian financial year, plus CSV/PDF export. Opening balances must use an effective date so historical reports remain reproducible.

## Before launch

- Confirm invoice fields, GST treatment, CD deduction rules and cash-payment compliance with the company's accountant.
- Encrypt bank account numbers and restrict decrypted access.
- Add database-level row security or equivalent API authorization.
- Test concurrent billing, stock-underflow prevention, backup restore and invoice number uniqueness.
