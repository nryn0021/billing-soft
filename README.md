# Jai Mata Di Gud Mill

A responsive billing and inventory workspace for a multi-branch grain business.

## Prototype features

- Sale and purchase bills with printable invoice/voucher output
- Kilogram, quintal and tonne conversion, normalized to kilograms
- Per-kilogram base rates with bill-level overrides and an audit trail
- Configurable 2.5% CD deduction on eligible purchase bills above INR 20,000
- Cash, online, split and credit payments with outstanding dues
- Debtor and creditor party ledgers
- Grain inventory updated by each sale or purchase
- Daily rate book for rice varieties, wheat, moong, khesari and maize
- Branch filtering, role previews and summary reports
- Browser-local persistence for realistic prototype use

## Run locally

```bash
npm install
npm run dev
```

Use `npm run lint` and `npm run build` before shipping changes.

## Production boundary

This repository currently provides the working React front end and a browser-local domain model. Production use needs a server-side database and API, authenticated users, role enforcement on the server, immutable audit records, database transactions for billing and stock updates, backups, GST/accounting fields approved by the company's accountant, and secure handling of party bank details.

The CD rule is represented exactly as requested, but it should be validated with the company's accountant before production use.
