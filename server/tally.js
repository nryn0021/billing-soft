// Tally XML interchange — parsing side (import).
//
// Tally exchanges masters/vouchers as an <ENVELOPE> of <TALLYMESSAGE> nodes. We import the
// LEDGER masters (parties) and their opening balances — the practically-safe, lossless subset
// for a mill migrating in: every customer/supplier and the dues they carry. Voucher (bill)
// import is deliberately NOT done here: a grain bill needs product + weight + rate + branch +
// stock movement, none of which a generic Tally voucher carries, so fabricating those would
// corrupt stock and the rate book. The exporter (client side) still emits full vouchers so the
// data round-trips OUT to Tally completely.
//
// The parser is intentionally dependency-free and tolerant: Tally XML is regular enough that a
// scoped tag/attribute extractor is robust, and it avoids pulling a full XML library into the
// server for one feature.

/** First <TAG>…</TAG> inner text within `block` (case-insensitive), or "". */
function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decodeXml(m[1].trim()) : "";
}

/** An attribute value on the opening tag, e.g. NAME="…". */
function attr(block, name) {
  const m = block.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
  return m ? decodeXml(m[1].trim()) : "";
}

function decodeXml(s) {
  return String(s)
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

// Tally amounts can look like "1,234.50 Dr", "-1234.50", "(-)1234.50".
function parseAmount(raw) {
  const s = String(raw || "").replace(/,/g, "").trim();
  if (!s) return 0;
  const neg = /dr\b/i.test(s) ? false : /cr\b/i.test(s) ? true : /^\(?-/.test(s);
  const num = Number((s.match(/-?\d+(\.\d+)?/) || [0])[0]);
  if (!Number.isFinite(num)) return 0;
  return neg ? -Math.abs(num) : Math.abs(num);
}

/**
 * Extract party ledgers from a Tally masters export.
 * Returns [{ name, phone, address, gstin, kind, openingBalance }] — openingBalance in rupees,
 * kind derived from the Tally group (Sundry Debtors → customer, Sundry Creditors → supplier).
 * Non-party ledgers (Cash, Sales, Duties & Taxes, Bank, …) are skipped.
 */
export function parseTallyLedgers(xml) {
  const text = String(xml || "");
  if (!/<LEDGER[\s>]/i.test(text)) return [];
  const out = [];
  const blocks = text.match(/<LEDGER\b[\s\S]*?<\/LEDGER>/gi) || [];
  for (const block of blocks.slice(0, 20000)) {
    const name = (tag(block, "NAME") || attr(block, "NAME")).trim();
    if (!name) continue;
    const parent = tag(block, "PARENT").toLowerCase();
    // Only sundry debtors/creditors are trading parties. Everything else in the chart of
    // accounts (tax, bank, cash, sales/purchase heads) is not a party in this app.
    const isDebtor = parent.includes("debtor");
    const isCreditor = parent.includes("creditor");
    if (!isDebtor && !isCreditor) continue;
    const phone = (tag(block, "LEDGERPHONE") || tag(block, "PHONENUMBER") || tag(block, "LEDGERMOBILE")).replace(/[^\d]/g, "").slice(-10);
    const gstin = tag(block, "PARTYGSTIN") || tag(block, "GSTIN") || tag(block, "GSTREGISTRATIONNUMBER");
    // ADDRESS may be a single tag or an ADDRESS.LIST of several lines.
    const addrLines = (block.match(/<ADDRESS>([\s\S]*?)<\/ADDRESS>/gi) || []).map((a) => decodeXml(a.replace(/<\/?ADDRESS>/gi, "").trim()));
    const address = addrLines.filter(Boolean).join(", ");
    out.push({
      name,
      phone,
      address,
      gstin,
      kind: isCreditor ? "supplier" : "customer",
      openingBalance: Math.abs(parseAmount(tag(block, "OPENINGBALANCE"))),
    });
  }
  return out;
}
