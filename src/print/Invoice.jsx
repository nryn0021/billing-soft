import { useApp } from "../context/AppContext";
import { cx, QrPlaceholder } from "../ui";
import { amountInWords, formatDateLong, inr2, num, paymentStamp, txProductLabel } from "../lib/format";
import { qrVisible } from "../lib/qr";

/* Payment-status rubber stamp — green (paid) / orange (part-paid) / red (unpaid). */
function PaymentStamp({ invoice, className, style }) {
  const ps = paymentStamp(invoice);
  return (
    <div className={cx("pay-stamp", ps.state, className)} style={style}>
      <span className="ps-main">{ps.label}</span>
      <span className="ps-sub">{ps.sub}</span>
    </div>
  );
}

/**
 * Global printable document. Driven by context.printJob = { invoice, format, qr }.
 *   format "a4" | "thermal" → standard sale/purchase invoice
 *   format "gst"            → truck-sale GST "Bill of Supply"
 *   format "challan"        → truck-sale transport "Challan" (builty)
 * All business data comes from editable settings — nothing is hardcoded.
 */
export function PrintInvoice() {
  const { printJob, settings } = useApp();
  if (!printJob?.invoice) return null;
  const { invoice, format, qr } = printJob;
  if (format === "gst") return <div className="print-root" data-format="gst"><BillOfSupplySheet invoice={invoice} settings={settings} qr={qr} /></div>;
  if (format === "challan") return <div className="print-root" data-format="challan"><ChallanSheet invoice={invoice} settings={settings} qr={qr} /></div>;
  // Both documents in one print job → Challan on page 1, Bill of Supply on page 2.
  if (format === "challan+gst") return (
    <div className="print-root" data-format="gst">
      <ChallanSheet invoice={invoice} settings={settings} qr={qr} />
      <div style={{ breakBefore: "page" }}><BillOfSupplySheet invoice={invoice} settings={settings} qr={qr} /></div>
    </div>
  );
  return <StandardInvoice invoice={invoice} settings={settings} format={format} qr={qr} />;
}

/* Handwritten proprietor signature block — printed on every bill. */
function Signature({ b, inv }) {
  return (
    <div className="inv-sign">
      <div className="line">Party signature</div>
      <div style={{ width: 200, textAlign: "center" }}>
        <span className="sig-name">{b.owner}</span>
        <div className="line" style={{ width: 200, margin: 0 }}>
          For {b.name}<br />{b.owner}, Proprietor
        </div>
        {inv?.signatureName && inv.signatureName !== "Authorised signatory" && (
          <div style={{ fontSize: 10, color: "var(--i-soft)", marginTop: 2 }}>{inv.signatureName}</div>
        )}
      </div>
    </div>
  );
}

function StandardInvoice({ invoice, settings, format, qr }) {
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
            {invoice.partyGstin && <div className="inv-kv"><span>GSTIN</span><b>{invoice.partyGstin}</b></div>}
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
            {invoice.remarks && <p style={{ color: "var(--i-soft)", fontSize: 11, marginTop: 8 }}>Remarks: {invoice.remarks}</p>}
            <p style={{ color: "var(--i-soft)", fontSize: 11, marginTop: 8 }}>{inv.terms}</p>
            <PaymentStamp invoice={invoice} style={{ marginTop: 16 }} />
          </div>
          <div className="inv-totals">
            <div className="row"><span style={{ color: "var(--i-soft)" }}>Gross amount</span><b>{inr2.format(invoice.gross)}</b></div>
            {invoice.cdDeduction > 0 && <div className="row"><span style={{ color: "var(--i-soft)" }}>CD deduction</span><b>- {inr2.format(invoice.cdDeduction)}</b></div>}
            {invoice.discount > 0 && <div className="row"><span style={{ color: "var(--i-soft)" }}>Discount</span><b>- {inr2.format(invoice.discount)}</b></div>}
            <div className="row grand"><span>Net {isSale ? "receivable" : "payable"}</span><span>{inr2.format(invoice.netAmount)}</span></div>
            <div className="row"><span style={{ color: "var(--i-soft)" }}>Paid</span><b>{inr2.format(invoice.paidAmount)}</b></div>
            <div className="row"><span style={{ color: "var(--i-soft)" }}>Balance due</span><b>{inr2.format(invoice.dueAmount)}</b></div>
          </div>
        </div>

        {qrVisible(settings, invoice, format) && (
          <div className="inv-pay inv-hide-thermal">
            {qr ? <img src={qr} alt="Payment QR" width={78} height={78} style={{ borderRadius: 6 }} /> : <QrPlaceholder size={78} color="#131d18" bg="#ffffff" />}
            <div>
              <div style={{ fontWeight: 700 }}>Scan to pay {inr2.format(invoice.dueAmount)}</div>
              <div style={{ color: "var(--i-soft)", fontSize: 11 }}>UPI: {bank.upi}</div>
            </div>
          </div>
        )}

        <Signature b={b} inv={inv} />
        <p className="inv-note">{inv.footer} · This is a computer-generated {isSale ? "invoice" : "voucher"}.</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Truck sale — GST "Bill of Supply" (exempted agricultural goods)
 * ------------------------------------------------------------------ */
const money0 = (v) => `₹${Number(v || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

function BillOfSupplySheet({ invoice, settings, qr }) {
  const b = settings.business || {};
  const bank = settings.bank || {};
  const m = invoice.meta || {};
  const rateQtl = invoice.rate * 100;
  const showQr = qrVisible(settings, invoice, "gst");
  // Signed adjustment row helper (+/- prefix; negative deducts).
  const adjRow = (label, value) => value != null && value !== 0 && (
    <tr><td colSpan={6} className="r">{label}</td><td className="r">{value < 0 ? "- " : "+ "}{inr2.format(Math.abs(value))}</td></tr>
  );
  return (
      <div className="doc-sheet">
        <div className="frame">
          <div style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1.5px solid var(--d-line)" }}>
            <div className="doc-title">{b.name}</div>
            <div className="doc-sub">Add — {(b.addressLines || []).join(", ")}</div>
            <div className="doc-sub b">[ MAIZE / PADDY / JAGGERY / WHEAT / RICE — Exempted Goods U/S 23(1) of GST Act 2017 ]</div>
            <div className="hindi">मक्का, धान, गुड़, गेहूँ, चावल अन्य कृषि उपज</div>
          </div>

          <table className="noborder" style={{ borderBottom: "1px solid var(--d-line)" }}>
            <tbody>
              <tr>
                <td style={{ width: "40%" }}>GSTIN: <b>{b.gstin}</b></td>
                <td style={{ width: "30%", textAlign: "center" }}><span className="doc-title" style={{ fontSize: 18 }}>Bill of Supply</span></td>
                <td style={{ width: "30%", textAlign: "right", fontSize: 9.5, color: "var(--d-soft)" }}>Original for Recipient · Duplicate for Transporter · Triplicate for Seller</td>
              </tr>
            </tbody>
          </table>

          <table>
            <tbody>
              <tr>
                <td style={{ width: "50%" }}>Invoice No: <b>{m.invoiceNo || invoice.id}</b></td>
                <td>Driver Mob: <b>{m.driverMob || "—"}</b></td>
              </tr>
              <tr>
                <td>Invoice Date: <b>{formatDateLong(invoice.date)}</b></td>
                <td>Vehicle No: <b>{m.vehicleNo || "—"}</b></td>
              </tr>
              <tr>
                <td>Transporter: <b>{m.transportName || "—"}{m.transportMob ? ` · ${m.transportMob}` : ""}</b></td>
                <td>Place of Supply: <b>{m.placeOfSupply || "—"}</b></td>
              </tr>
            </tbody>
          </table>

          <table>
            <tbody>
              <tr><td className="band b" style={{ width: 90 }}>Name</td><td colSpan={3}><b>{invoice.party}</b></td></tr>
              <tr><td className="band b">Address</td><td colSpan={3}>{invoice.partyAddress}</td></tr>
              <tr>
                <td className="band b">Mobile</td><td style={{ width: "35%" }}>{invoice.partyPhone}</td>
                <td className="band b" style={{ width: 90 }}>GSTIN</td><td>{m.buyerGstin || "—"}</td>
              </tr>
            </tbody>
          </table>

          <table className="goods">
            <thead>
              <tr>
                <th style={{ width: 34 }}>Sl</th><th>Description of Goods</th><th style={{ width: 70 }}>HSN</th>
                <th style={{ width: 70 }} className="r">Qty (bags)</th><th style={{ width: 80 }} className="r">Weight (kg)</th>
                <th style={{ width: 80 }} className="r">Rate/qtl</th><th style={{ width: 90 }} className="r">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="tall">
                <td>1</td>
                <td><b>{invoice.product}</b>{invoice.productHindi ? ` / ${invoice.productHindi}` : ""}</td>
                <td>{m.hsnCode || "—"}</td>
                <td className="r">{m.bags ? num.format(m.bags) : "—"}</td>
                <td className="r">{num.format(invoice.totalKg)}</td>
                <td className="r">{money0(rateQtl)}</td>
                <td className="r">{inr2.format(invoice.gross)}</td>
              </tr>
              {invoice.discount > 0 && <tr><td colSpan={6} className="r">Discount</td><td className="r">- {inr2.format(invoice.discount)}</td></tr>}
              {adjRow("Loading Charge", m.loadingCharge)}
              {adjRow("Bhara Adv", m.bharaAdv)}
              {adjRow("Bhada Less", m.bharaLess)}
              <tr className="band"><td colSpan={6} className="r grand">Grand Total</td><td className="r grand">{inr2.format(invoice.netAmount)}</td></tr>
            </tbody>
          </table>

          <table className="noborder">
            <tbody>
              <tr>
                <td style={{ width: "60%", verticalAlign: "top", paddingTop: 6 }}>
                  <div className="words"><span className="doc-sub b">Amount in words</span><div style={{ fontWeight: 700 }}>{amountInWords(Math.round(invoice.netAmount))} Rupees Only</div></div>
                  <div style={{ marginTop: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div className="kbox" style={{ flex: 1 }}>
                      <div className="k">Bank details</div>
                      <div><b>{bank.name}</b> · Banka</div>
                      <div>A/c No.: <b>{bank.account}</b></div>
                      <div>IFSC: <b>{bank.ifsc}</b></div>
                      <div>UPI: <b>{bank.upi}</b></div>
                    </div>
                    {showQr && qr && (
                      <div style={{ textAlign: "center" }}>
                        <img src={qr} alt="Payment QR" width={78} height={78} style={{ border: "1px solid var(--d-line)" }} />
                        <div style={{ fontSize: 8.5, color: "var(--d-soft)" }}>Scan &amp; Pay</div>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 10 }}>Broker: <b>{m.brokerName || "—"}{m.brokerMob ? ` · ${m.brokerMob}` : ""}</b></div>
                  {invoice.remarks && <div style={{ marginTop: 4, fontSize: 10, color: "var(--d-soft)" }}>Remarks: {invoice.remarks}</div>}
                  <PaymentStamp invoice={invoice} className="compact" style={{ marginTop: 10 }} />
                </td>
                <td style={{ verticalAlign: "top" }}>
                  <div className="foot-sign">
                    <div style={{ fontSize: 11 }}>For <b>{b.name}</b></div>
                    <div className="sig-name" style={{ margin: "6px 0 2px" }}>{b.owner}</div>
                    <div style={{ fontSize: 11 }}>{b.owner}, Proprietor</div>
                    <div className="stamp">Authorised Signatory / Stamp</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 10, color: "var(--d-soft)", marginTop: 6 }}>Terms: {settings.invoice?.terms || "In no case goods will be taken back or exchanged."}</p>
      </div>
  );
}

/* ------------------------------------------------------------------ *
 *  Truck sale — transport "Challan" (builty)
 * ------------------------------------------------------------------ */
function ChallanSheet({ invoice, settings, qr }) {
  const b = settings.business || {};
  const bank = settings.bank || {};
  const m = invoice.meta || {};
  const showQr = qrVisible(settings, invoice, "challan");
  const row = (k, v) => <tr><td className="band b" style={{ width: 96 }}>{k}</td><td>{v || "—"}</td></tr>;
  return (
      <div className="doc-sheet">
        <div className="frame">
          <div style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1.5px solid var(--d-line)" }}>
            <div style={{ fontSize: 10, color: "var(--d-soft)" }}>{b.contact}</div>
            <div className="doc-title">{b.name}</div>
            <div className="doc-sub">{(b.addressLines || []).join(", ")} &nbsp;·&nbsp; CHALLAN</div>
            <div className="doc-sub">GSTIN: <b>{b.gstin}</b></div>
          </div>

          <table className="noborder" style={{ borderBottom: "1px solid var(--d-line)" }}>
            <tbody>
              <tr>
                <td style={{ width: "50%" }}>No: <b>{m.challanNo || invoice.id}</b></td>
                <td className="r">Date: <b>{formatDateLong(invoice.date)}</b></td>
              </tr>
              <tr><td colSpan={2}>{m.placeOfSupply ? `${m.placeOfSupply} TO` : "Consignment to"}</td></tr>
            </tbody>
          </table>

          <table>
            <tbody>
              <tr>
                <td style={{ width: "54%", verticalAlign: "top" }}>
                  <div className="band b" style={{ marginBottom: 4 }}>Consignee Name &amp; Address</div>
                  <div style={{ fontWeight: 700 }}>{invoice.party}</div>
                  <div style={{ color: "var(--d-soft)" }}>{invoice.partyAddress}</div>
                  <div style={{ marginTop: 4 }}>Mob: {invoice.partyPhone}{m.buyerGstin ? ` · GSTIN ${m.buyerGstin}` : ""}</div>
                  <table style={{ marginTop: 8 }}>
                    <thead><tr className="band"><th style={{ textAlign: "left" }}>Prod. Name</th><th className="r">Qty (bags)</th><th className="r">Weight (kg)</th></tr></thead>
                    <tbody><tr><td><b>{invoice.product}</b></td><td className="r">{m.bags ? num.format(m.bags) : "—"}</td><td className="r">{num.format(invoice.totalKg)}</td></tr></tbody>
                  </table>
                </td>
                <td style={{ verticalAlign: "top", padding: 0 }}>
                  <table className="noborder"><tbody>
                    {row("Driver", m.driverName)}
                    {row("Driver Mob", m.driverMob)}
                    {row("Owner", m.ownerName)}
                    {row("Owner Mob", m.ownerMob)}
                    {row("Vehicle No", m.vehicleNo)}
                    {row("D.L. No", m.dlNo)}
                    {row("Freight", m.freight ? inr2.format(m.freight) : "")}
                    {row("Bhara", m.bhara ? inr2.format(m.bhara) : "")}
                    {row("Advance", m.advance ? inr2.format(m.advance) : "")}
                    {row("To Pay", m.toPay ? inr2.format(m.toPay) : "")}
                  </tbody></table>
                </td>
              </tr>
            </tbody>
          </table>

          {invoice.remarks && <div style={{ padding: "4px 6px", fontSize: 10, color: "var(--d-soft)" }}>Remarks: {invoice.remarks}</div>}

          <table className="noborder">
            <tbody>
              <tr>
                <td style={{ verticalAlign: "bottom" }}>
                  <div>Broker: <b>{m.brokerName || "—"}{m.brokerMob ? ` · ${m.brokerMob}` : ""}</b></div>
                  <div>Transport: <b>{m.transportName || "—"}{m.transportMob ? ` · ${m.transportMob}` : ""}</b></div>
                  <PaymentStamp invoice={invoice} className="compact" style={{ marginTop: 8 }} />
                </td>
                {showQr && qr && (
                  <td style={{ width: 96, textAlign: "center", verticalAlign: "bottom" }}>
                    <img src={qr} alt="Payment QR" width={72} height={72} style={{ border: "1px solid var(--d-line)" }} />
                    <div style={{ fontSize: 8.5, color: "var(--d-soft)" }}>Scan &amp; Pay{bank.upi ? ` · ${bank.upi}` : ""}</div>
                  </td>
                )}
                <td style={{ width: 190, textAlign: "center", verticalAlign: "bottom" }}>
                  <div className="sig-name">{b.owner}</div>
                  <div className="stamp">Signature / Stamp · {b.owner}, Proprietor</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
  );
}
