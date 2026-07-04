import { useApp } from "../context/AppContext";
import { QrPlaceholder } from "../ui";
import { amountInWords, formatDateLong, inr2, num, txProductLabel } from "../lib/format";

/**
 * Global printable A4 invoice. Driven by context.printJob = { invoice, format, qr }.
 * All business data comes from editable settings — nothing is hardcoded. Hidden on
 * screen (.print-root); revealed only by the print stylesheet with a fixed
 * dark-on-white palette so it prints correctly in any theme.
 */
export function PrintInvoice() {
  const { printJob, settings } = useApp();
  if (!printJob?.invoice) return null;
  const { invoice, format, qr } = printJob;
  const isSale = invoice.type === "sale";
  const b = settings.business || {};
  const bank = settings.bank || {};
  const inv = settings.invoice || {};

  return (
    <div className="print-root" data-format={format === "thermal" ? "thermal" : "a4"}>
      <div className="invoice-sheet">
        <header className="inv-head">
          <div className="inv-brand">
            <div className="inv-logo">{inv.logoText || "JM"}</div>
            <div>
              <div className="inv-kicker">{b.tagline}</div>
              <h1 style={{ fontSize: 20, margin: "2px 0" }}>{b.name}</h1>
              <div style={{ color: "var(--i-soft)", fontSize: 11.5 }}>
                {(b.addressLines || []).join(", ")}<br />
                Owner: {b.owner} · {b.contact}{b.email ? ` · ${b.email}` : ""}<br />
                GSTIN: <b style={{ color: "var(--i-ink)" }}>{b.gstin}</b>
              </div>
            </div>
          </div>
          <div className="inv-title">
            <span>{isSale ? "Sale Invoice" : "Purchase Voucher"}</span>
            <strong>{invoice.id}</strong>
            <div style={{ color: "var(--i-soft)", fontSize: 11.5, marginTop: 4 }}>
              {formatDateLong(invoice.date)}<br />Office: {invoice.branch}
            </div>
          </div>
        </header>

        <div className="inv-grid">
          <div className="inv-box">
            <h3>{isSale ? "Billed to" : "Received from"}</h3>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{invoice.party}</div>
            <div style={{ color: "var(--i-soft)", marginTop: 2 }}>{invoice.partyAddress || "Address not added"}</div>
            <div className="inv-kv" style={{ marginTop: 6 }}><span>Contact</span><b>{invoice.partyPhone || "—"}</b></div>
            <div className="inv-kv"><span>Payment mode</span><b>{invoice.paymentMethod}</b></div>
            {invoice.partyBankAccount && <div className="inv-kv"><span>Bank / IFSC</span><b>{invoice.partyBankAccount} · {invoice.partyBankIfsc}</b></div>}
          </div>
          <div className="inv-box">
            <h3>Pay to</h3>
            <div className="inv-kv"><span>Bank</span><b>{bank.name}</b></div>
            <div className="inv-kv"><span>A/C No.</span><b>{bank.account}</b></div>
            <div className="inv-kv"><span>IFSC</span><b>{bank.ifsc}</b></div>
            <div className="inv-kv"><span>Branch</span><b>{bank.branch}</b></div>
          </div>
        </div>

        <table>
          <thead>
            <tr><th style={{ width: 30 }}>#</th><th>Grain description</th><th className="r">Entered</th><th className="r">Weight</th><th className="r">Rate / kg</th><th className="r">Amount</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>1</td>
              <td><b>{txProductLabel(invoice)}</b></td>
              <td className="r">{num.format(invoice.quantity)} {invoice.unit}</td>
              <td className="r">{num.format(invoice.totalKg)} kg</td>
              <td className="r">{inr2.format(invoice.rate)}</td>
              <td className="r">{inr2.format(invoice.gross)}</td>
            </tr>
          </tbody>
        </table>

        <div className="inv-foot">
          <div className="inv-words">
            <span>Amount in words</span>
            <div style={{ fontWeight: 600, marginTop: 2 }}>{amountInWords(Math.round(invoice.netAmount))} Rupees Only</div>
            <p style={{ color: "var(--i-soft)", fontSize: 11, marginTop: 8 }}>{inv.terms}</p>
          </div>
          <div className="inv-totals">
            <div className="row"><span style={{ color: "var(--i-soft)" }}>Gross amount</span><b>{inr2.format(invoice.gross)}</b></div>
            {invoice.cdDeduction > 0 && <div className="row"><span style={{ color: "var(--i-soft)" }}>CD deduction</span><b>- {inr2.format(invoice.cdDeduction)}</b></div>}
            <div className="row grand"><span>Net {isSale ? "receivable" : "payable"}</span><span>{inr2.format(invoice.netAmount)}</span></div>
            <div className="row"><span style={{ color: "var(--i-soft)" }}>Paid</span><b>{inr2.format(invoice.paidAmount)}</b></div>
            <div className="row"><span style={{ color: "var(--i-soft)" }}>Balance due</span><b>{inr2.format(invoice.dueAmount)}</b></div>
          </div>
        </div>

        {inv.showQr !== false && (
          <div className="inv-pay inv-hide-thermal">
            {qr ? <img src={qr} alt="Payment QR" width={78} height={78} style={{ borderRadius: 6 }} /> : <QrPlaceholder size={78} color="#131d18" bg="#ffffff" />}
            <div>
              <div style={{ fontWeight: 700 }}>Scan to pay</div>
              <div style={{ color: "var(--i-soft)", fontSize: 11 }}>UPI: {bank.upi}</div>
              {!settings.qrImage && <div style={{ color: "var(--i-soft)", fontSize: 10, marginTop: 2 }}>Generated from your UPI id · upload a custom QR in Settings.</div>}
            </div>
          </div>
        )}

        <div className="inv-sign">
          <div className="line">Party signature</div>
          <div className="line">For {b.name}<br />{inv.signatureName || "Authorised signatory"}</div>
        </div>
        <p className="inv-note">{inv.footer} · This is a computer-generated {isSale ? "invoice" : "voucher"}.</p>
      </div>
    </div>
  );
}
