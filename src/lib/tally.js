// Tally XML export (client side). Builds the standard Tally <ENVELOPE> "Import Data" masters +
// vouchers document from the app's parties and bills, so the whole book round-trips OUT to Tally.
// (The import side is server-side — see server/tally.js — because it writes tenant-scoped rows.)

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Tally wants amounts as plain rupees; debit positive, credit negative on ledger entries.
function amt(rupees) {
  return Number(rupees || 0).toFixed(2);
}

// Tally date is yyyymmdd.
function tallyDate(value) {
  const d = new Date(value || Date.now());
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}

function ledgerMaster(party) {
  const parent = party.balanceType === "creditor" || party.kind === "supplier" ? "Sundry Creditors" : "Sundry Debtors";
  // Opening balance sign: debit (debtor) positive, credit (creditor) negative — Tally convention.
  const bal = party.balanceType === "creditor" ? -Math.abs(party.balance || 0) : Math.abs(party.balance || 0);
  return `   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <LEDGER NAME="${esc(party.name)}" ACTION="Create">
     <NAME>${esc(party.name)}</NAME>
     <PARENT>${parent}</PARENT>
     <ISBILLWISEON>Yes</ISBILLWISEON>
     <OPENINGBALANCE>${amt(bal)}</OPENINGBALANCE>
     ${party.phone ? `<LEDGERPHONE>${esc(party.phone)}</LEDGERPHONE>` : ""}
     ${party.gstin ? `<PARTYGSTIN>${esc(party.gstin)}</PARTYGSTIN>` : ""}
     ${party.address ? `<ADDRESS.LIST><ADDRESS>${esc(party.address)}</ADDRESS></ADDRESS.LIST>` : ""}
    </LEDGER>
   </TALLYMESSAGE>`;
}

function voucher(tx, salesLedger, purchaseLedger) {
  const isSale = tx.type === "sale";
  const vchType = isSale ? "Sales" : "Purchase";
  const partyName = esc(tx.party);
  const total = Number(tx.netAmount || 0);
  const incomeLedger = isSale ? salesLedger : purchaseLedger;
  // Double entry: party ledger vs the sales/purchase head. Signs follow Tally's Dr/Cr rules
  // (sale: party Dr, sales Cr; purchase: party Cr, purchase Dr).
  const partyAmt = isSale ? total : -total;
  const headAmt = isSale ? -total : total;
  return `   <TALLYMESSAGE xmlns:UDF="TallyUDF">
    <VOUCHER VCHTYPE="${vchType}" ACTION="Create" OBJVIEW="Accounting Voucher View">
     <DATE>${tallyDate(tx.date)}</DATE>
     <EFFECTIVEDATE>${tallyDate(tx.date)}</EFFECTIVEDATE>
     <VOUCHERTYPENAME>${vchType}</VOUCHERTYPENAME>
     <VOUCHERNUMBER>${esc(tx.id)}</VOUCHERNUMBER>
     <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>
     <NARRATION>${esc(`${tx.product || ""} ${tx.totalKg || ""}kg${tx.remarks ? " · " + tx.remarks : ""}`)}</NARRATION>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${partyName}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>${partyAmt >= 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
      <AMOUNT>${amt(-partyAmt)}</AMOUNT>
     </ALLLEDGERENTRIES.LIST>
     <ALLLEDGERENTRIES.LIST>
      <LEDGERNAME>${incomeLedger}</LEDGERNAME>
      <ISDEEMEDPOSITIVE>${headAmt >= 0 ? "Yes" : "No"}</ISDEEMEDPOSITIVE>
      <AMOUNT>${amt(-headAmt)}</AMOUNT>
     </ALLLEDGERENTRIES.LIST>
    </VOUCHER>
   </TALLYMESSAGE>`;
}

/**
 * Build a full Tally-importable XML document from parties + bills.
 * opts.masters / opts.vouchers toggle each section (both on by default).
 */
export function buildTallyXml(parties = [], bills = [], opts = {}) {
  const { masters = true, vouchers = true, salesLedger = "Sales", purchaseLedger = "Purchase" } = opts;
  const messages = [];
  if (masters) for (const p of parties) messages.push(ledgerMaster(p));
  if (vouchers) for (const b of bills) messages.push(voucher(b, salesLedger, purchaseLedger));
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
 <HEADER>
  <TALLYREQUEST>Import Data</TALLYREQUEST>
 </HEADER>
 <BODY>
  <IMPORTDATA>
   <REQUESTDESC>
    <REPORTNAME>All Masters</REPORTNAME>
   </REQUESTDESC>
   <REQUESTDATA>
${messages.join("\n")}
   </REQUESTDATA>
  </IMPORTDATA>
 </BODY>
</ENVELOPE>`;
}

/** Trigger a download of the Tally XML file. */
export function downloadTallyXml(filename, xml) {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename.endsWith(".xml") ? filename : `${filename}.xml`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
