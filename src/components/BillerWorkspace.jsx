import { useMemo, useState } from "react";
import {
  FiArrowDownLeft,
  FiArrowUpRight,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiCreditCard,
  FiFileText,
  FiLogOut,
  FiMapPin,
  FiPackage,
  FiPhone,
  FiPrinter,
  FiSave,
  FiSearch,
  FiUser,
} from "react-icons/fi";
import { api } from "../api";
import Calculator from "./Calculator";

const kgPerUnit = { kg: 1, quintal: 100, tonne: 1000 };
const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

const blankParty = { id: "", name: "", phone: "", address: "" };

export default function BillerWorkspace({ user, initialData, onData, onLogout }) {
  const [data, setData] = useState(initialData);
  const [type, setType] = useState("purchase");
  const [party, setParty] = useState(blankParty);
  const [partyQuery, setPartyQuery] = useState("");
  const [partyOpen, setPartyOpen] = useState(false);
  const [productId, setProductId] = useState(initialData.products[0]?.id || "");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("quintal");
  const [rate, setRate] = useState(String(initialData.products[0]?.baseRate || ""));
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [applyCd, setApplyCd] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [invoice, setInvoice] = useState(null);

  const product = data.products.find((item) => item.id === productId) || data.products[0];
  const branch = data.branches.find((item) => item.id === user.branchId) || data.branches[0];
  const matches = useMemo(() => {
    const search = partyQuery.trim().toLowerCase();
    if (!search) return data.parties.slice(0, 5);
    const digits = search.replace(/\D/g, "");
    return data.parties.filter((item) => item.name.toLowerCase().includes(search) || (digits && item.phone.replace(/\D/g, "").includes(digits))).slice(0, 6);
  }, [data.parties, partyQuery]);
  const totalKg = Number(quantity || 0) * kgPerUnit[unit];
  const gross = totalKg * Number(rate || 0);
  const deduction = type === "purchase" && applyCd && gross > 20000 ? gross * 0.025 : 0;
  const net = gross - deduction;
  const due = Math.max(0, net - Number(paidAmount || 0));
  const rateOverride = product && Number(rate) !== product.baseRate;

  const chooseProduct = (id) => {
    const selected = data.products.find((item) => item.id === id);
    setProductId(id);
    setRate(String(selected.baseRate));
  };

  const chooseParty = (selected) => {
    setParty({ id: selected.id, name: selected.name, phone: selected.phone, address: selected.address });
    setPartyQuery(selected.name);
    setPartyOpen(false);
  };

  const changePartyName = (value) => {
    setPartyQuery(value);
    setParty((current) => ({ ...current, id: "", name: value }));
    setPartyOpen(true);
  };

  const resetBill = () => {
    setParty(blankParty);
    setPartyQuery("");
    setQuantity("");
    setPaidAmount("");
    setPaymentMethod(type === "purchase" ? "Cash" : "Online / Bank");
    setRate(String(product.baseRate));
    setError("");
  };

  const save = async (shouldPrint = false) => {
    setError("");
    setSuccess("");
    if (!party.name.trim() || !party.phone.trim() || !party.address.trim()) return setError("Party name, contact number and address are required.");
    if (!quantity || Number(quantity) <= 0) return setError("Enter a valid grain quantity.");
    setSaving(true);
    try {
      const result = await api.createBill({
        type,
        branchId: branch.id,
        party,
        productId,
        quantity: Number(quantity),
        unit,
        rate: Number(rate),
        paymentMethod,
        paidAmount: Number(paidAmount || 0),
        applyCd,
      });
      setData(result.data);
      onData(result.data);
      setInvoice(result.bill);
      setSuccess(`${result.bill.id} saved successfully`);
      resetBill();
      if (shouldPrint) window.setTimeout(() => window.print(), 250);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <main className="biller-workspace">
        <header className="biller-topbar">
          <div className="biller-brand"><span>JM</span><div><strong>Jai Mata Di Gud Mill</strong><small>Billing desk</small></div></div>
          <div className="biller-office"><FiMapPin /><span><small>Billing office</small><strong>{branch?.name}</strong></span></div>
          <div className="biller-clock"><FiClock /><span>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date())}</span></div>
          <div className="biller-profile"><div>{initials(user.displayName)}</div><span><strong>{user.displayName}</strong><small>Biller · {branch?.name}</small></span><FiChevronDown /><button onClick={onLogout}><FiLogOut /> Sign out</button></div>
        </header>

        <div className="biller-body">
          <section className="billing-canvas">
            <div className="billing-title"><div><span className="eyebrow">New transaction</span><h1>Create a bill</h1><p>Complete the details below. Stock and party balance update automatically.</p></div><div className="bill-number"><span>Bill number</span><strong>Auto-assigned on save</strong></div></div>

            <div className="bill-type-switch">
              <button className={type === "purchase" ? "active purchase" : ""} onClick={() => { setType("purchase"); setPaymentMethod("Cash"); }}><span><FiArrowDownLeft /></span><div><strong>Purchase bill</strong><small>Buying grain from a farmer or party</small></div><i /></button>
              <button className={type === "sale" ? "active sale" : ""} onClick={() => { setType("sale"); setPaymentMethod("Online / Bank"); setApplyCd(false); }}><span><FiArrowUpRight /></span><div><strong>Sale bill</strong><small>Selling grain to a customer</small></div><i /></button>
            </div>

            {error && <div className="billing-message error">{error}</div>}
            {success && <div className="billing-message success"><FiCheckCircle /> {success}</div>}

            <section className="bill-form-card party-section">
              <header><span>01</span><div><h2>Party details</h2><p>Search an existing party or type new details to save automatically.</p></div></header>
              <div className="party-search-field">
                <label><span>Party name *</span><div><FiSearch /><input value={partyQuery} onChange={(event) => changePartyName(event.target.value)} onFocus={() => setPartyOpen(true)} placeholder="Start typing a name or phone number..." autoComplete="off" />{party.id && <em><FiCheckCircle /> Existing party</em>}</div></label>
                {partyOpen && partyQuery && <div className="party-suggestions">{matches.length ? matches.map((item) => <button key={item.id} onClick={() => chooseParty(item)}><span>{initials(item.name)}</span><div><strong>{item.name}</strong><small>{item.phone} · {item.address}</small></div><em>{item.id}</em></button>) : <div className="new-party-hint"><FiUser /><span><strong>New party</strong><small>Continue entering the contact number and address below. It will be saved with this bill.</small></span></div>}</div>}
              </div>
              <div className="biller-fields two"><label><span>Contact number *</span><div className="input-icon"><FiPhone /><input value={party.phone} onChange={(event) => setParty((current) => ({ ...current, phone: event.target.value }))} placeholder="10-digit mobile number" inputMode="tel" /></div></label><label><span>Full address *</span><div className="input-icon"><FiMapPin /><input value={party.address} onChange={(event) => setParty((current) => ({ ...current, address: event.target.value }))} placeholder="Village, city, district" /></div></label></div>
            </section>

            <section className="bill-form-card grain-section">
              <header><span>02</span><div><h2>Grain & weight</h2><p>Select the grain first; current stock appears separately.</p></div></header>
              <div className="grain-row"><label className="product-field"><span>Grain / item *</span><select value={productId} onChange={(event) => chooseProduct(event.target.value)}>{data.products.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><div className="selected-stock"><span><FiPackage /></span><div><small>Available stock</small><strong>{number.format(product?.stockKg)} kg</strong></div></div><label><span>Quantity *</span><input value={quantity} onChange={(event) => setQuantity(event.target.value)} type="number" min="0" step="0.01" placeholder="0.00" /></label><label><span>Unit *</span><select value={unit} onChange={(event) => setUnit(event.target.value)}><option value="kg">Kilogram</option><option value="quintal">Quintal</option><option value="tonne">Tonne</option></select></label></div>
              <div className="weight-conversion"><span>{quantity || "0"} {unit}</span><strong>=</strong><span>{number.format(totalKg)} kilograms</span></div>
            </section>

            <section className="bill-form-card payment-section">
              <header><span>03</span><div><h2>Rate & payment</h2><p>Review the base rate and record payment received or paid now.</p></div></header>
              <div className="biller-fields three"><label><span>Rate per kg *</span><div className={`rate-input ${rateOverride ? "override" : ""}`}><i>₹</i><input value={rate} onChange={(event) => setRate(event.target.value)} type="number" min="0" step="0.01" /></div><small className={rateOverride ? "rate-warning" : ""}>{rateOverride ? `Changed from base rate ${inr.format(product.baseRate)}` : "Today's base rate"}</small></label><label><span>Payment method</span><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option>Cash</option><option>Online / Bank</option><option>Split payment</option><option>Credit</option></select></label><label><span>Amount paid now</span><div className="rate-input"><i>₹</i><input value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} type="number" min="0" max={net} step="0.01" placeholder="0.00" /></div></label></div>
              {type === "purchase" && <label className="biller-cd"><input type="checkbox" checked={applyCd} onChange={(event) => setApplyCd(event.target.checked)} /><span><strong>Apply 2.5% CD deduction above ₹20,000</strong><small>The deduction is shown separately on the purchase voucher.</small></span></label>}
            </section>
          </section>

          <aside className="billing-sidebar">
            <section className="live-summary"><header><FiFileText /><div><span>Live total</span><h2>Bill summary</h2></div></header><div className="summary-product"><span>{product?.short}</span><div><strong>{product?.name}</strong><small>{number.format(totalKg)} kg × {inr.format(Number(rate || 0))}</small></div></div><dl><div><dt>Gross amount</dt><dd>{inr.format(gross)}</dd></div>{type === "purchase" && <div className="summary-deduction"><dt>CD deduction</dt><dd>- {inr.format(deduction)}</dd></div>}<div className="summary-net"><dt>Net {type === "purchase" ? "payable" : "receivable"}</dt><dd>{inr.format(net)}</dd></div><div><dt>Paid now</dt><dd>{inr.format(Number(paidAmount || 0))}</dd></div><div className="summary-due"><dt>Balance due</dt><dd>{inr.format(due)}</dd></div></dl><div className="summary-actions"><button className="print-save" onClick={() => save(true)} disabled={saving}><FiPrinter /> Save & print</button><button className="main-save" onClick={() => save(false)} disabled={saving}><FiSave /> {saving ? "Saving..." : "Save bill"}</button></div></section>
            <Calculator />
            <div className="biller-tip"><FiCreditCard /><span><strong>Payment reminder</strong><small>Any unpaid amount is added to the party ledger automatically.</small></span></div>
          </aside>
        </div>
      </main>
      <BillerInvoice invoice={invoice} />
    </>
  );
}

function BillerInvoice({ invoice }) {
  if (!invoice) return null;
  return <section className="print-invoice biller-print"><div className="invoice-frame"><header className="invoice-company"><div className="invoice-logo">JM</div><div><span className="invoice-kicker">Grain trading & processing</span><h1>Jai Mata Di Gud Mill</h1><p>Office: {invoice.branch} · Contact: +91 99552 99279</p></div><aside><span>{invoice.type === "sale" ? "SALE INVOICE" : "PURCHASE VOUCHER"}</span><strong>{invoice.id}</strong><small>{formatDate(invoice.date)}</small></aside></header><section className="invoice-owner"><span>Owner</span><strong>Pankaj Kumar Das</strong><i>All weights billed in kilograms</i></section><section className="invoice-party"><div><span>Bill to / Party</span><strong>{invoice.party}</strong></div><div><span>Billing office</span><strong>{invoice.branch}</strong></div><div><span>Payment mode</span><strong>{invoice.paymentMethod}</strong></div></section><table><thead><tr><th>#</th><th>Grain description</th><th>Entered weight</th><th>Total kg</th><th>Rate / kg</th><th>Amount</th></tr></thead><tbody><tr><td>1</td><td><strong>{invoice.product}</strong></td><td>{invoice.quantity} {invoice.unit}</td><td>{number.format(invoice.totalKg)} kg</td><td>{inr.format(invoice.rate)}</td><td>{inr.format(invoice.gross)}</td></tr></tbody></table><section className="invoice-bottom"><div className="invoice-words"><span>Amount in words</span><strong>{amountInWords(Math.round(invoice.netAmount))} rupees only</strong><p>Thank you for doing business with us.</p></div><div className="invoice-totals-new"><p><span>Gross amount</span><strong>{inr.format(invoice.gross)}</strong></p>{invoice.cdDeduction > 0 && <p><span>CD deduction (2.5%)</span><strong>- {inr.format(invoice.cdDeduction)}</strong></p>}<p className="grand"><span>Net amount</span><strong>{inr.format(invoice.netAmount)}</strong></p><p><span>Paid</span><strong>{inr.format(invoice.paidAmount)}</strong></p><p><span>Balance due</span><strong>{inr.format(invoice.dueAmount)}</strong></p></div></section><footer><div><span>Party signature</span></div><p>This is a computer-generated bill. Please verify weight and amount before leaving the office.</p><div><strong>For Jai Mata Di Gud Mill</strong><span>Authorised signatory</span></div></footer></div></section>;
}

function initials(name) { return name.split(" ").filter(Boolean).slice(0, 2).map((item) => item[0]).join("").toUpperCase(); }
function formatDate(value) { return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(value)); }

function amountInWords(value) {
  if (!value) return "Zero";
  const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const underHundred = (num) => num < 20 ? ones[num] : `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ""}`;
  const underThousand = (num) => `${num >= 100 ? `${ones[Math.floor(num / 100)]} Hundred ` : ""}${underHundred(num % 100)}`.trim();
  const parts = [];
  let remaining = Math.min(Math.floor(value), 999999999);
  const crore = Math.floor(remaining / 10000000); remaining %= 10000000;
  const lakh = Math.floor(remaining / 100000); remaining %= 100000;
  const thousand = Math.floor(remaining / 1000); remaining %= 1000;
  if (crore) parts.push(`${underThousand(crore)} Crore`);
  if (lakh) parts.push(`${underHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${underHundred(thousand)} Thousand`);
  if (remaining) parts.push(underThousand(remaining));
  return parts.join(" ");
}
