import { useMemo, useRef, useState } from "react";
import {
  FiArrowDownLeft, FiArrowUpRight, FiCheck, FiCheckCircle, FiCreditCard, FiMapPin, FiPackage,
  FiPhone, FiPrinter, FiSave, FiSearch, FiTag, FiUser,
} from "react-icons/fi";
import { TbCalculator } from "react-icons/tb";
import { useApp } from "../context/AppContext";
import { Badge, Button, Field, LiveClock, Modal, cx } from "../ui";
import { PAYMENT_METHODS, UNITS, inr2, kgPerUnit, num, productLabel, initials } from "../lib/format";
import { useBarcodeScanner } from "../lib/hooks";
import { Calculator } from "./Calculator";

const blankParty = { id: "", name: "", phone: "", address: "", bankAccount: "", bankIfsc: "", gstin: "" };
const SALE_TONE = "#d6336c"; // lotus / rose
const PURCHASE_TONE = "#c98a1f"; // warm golden amber
// Compact labels for the payment-method pills (canonical value is still stored on the bill).
const PAY_SHORT = { "Cash": "Cash", "Online / Bank": "Online", "Split payment": "Split", "Credit": "Credit" };

export function BillComposer({ type: initialType, defaultBranch, onClose }) {
  const { user, data, saveBill, settings, toast } = useApp();
  const isBiller = user.role === "biller";
  const [type, setType] = useState(initialType || "sale");
  const [party, setParty] = useState(blankParty);
  const [partyQuery, setPartyQuery] = useState("");
  const [partyOpen, setPartyOpen] = useState(false);
  const [productId, setProductId] = useState(data.products[0]?.id || "");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("quintal");
  const [rate, setRate] = useState(String(data.products[0]?.baseRate || ""));
  const [paymentMethod, setPaymentMethod] = useState("Cash"); // Cash ticked by default
  const [paidAmount, setPaidAmount] = useState("");
  const [applyDiscount, setApplyDiscount] = useState(false); // discount box only shows when ticked
  const [discount, setDiscount] = useState("");
  const [applyCd, setApplyCd] = useState(false); // default OFF — only applied when manually enabled
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const printRef = useRef(false);

  const branchOptions = data.branches;
  const fixedBranch = branchOptions.find((b) => b.id === user.branchId);
  const [branchId, setBranchId] = useState(
    isBiller ? (fixedBranch?.id || branchOptions[0]?.id)
      : (branchOptions.find((b) => b.name === defaultBranch)?.id || branchOptions[0]?.id),
  );

  const product = data.products.find((p) => p.id === productId) || data.products[0];
  const totalKg = Number(quantity || 0) * kgPerUnit[unit];
  const gross = totalKg * Number(rate || 0);
  // CD deduction mirrors the server: configurable rate/threshold, purchase-only, and rounded
  // UP to a whole rupee (never fractional paise) so the printed bill has clean figures.
  const cd = settings.cd || {};
  const cdRate = (cd.rate ?? 2.5) / 100;
  const cdThreshold = cd.threshold ?? 20000;
  const deduction = type === "purchase" && applyCd && cd.enabled !== false && gross > cdThreshold
    ? Math.ceil(gross * cdRate)
    : 0;
  const discountNow = applyDiscount ? Math.max(0, Number(discount || 0)) : 0;
  const net = gross - deduction - discountNow;
  const paidNow = Number(paidAmount || 0);
  const due = Math.max(0, net - paidNow);
  // Overpayment guard: compare in paise to avoid float noise. There is no advance/credit
  // facility, so paying more than the bill total is blocked (both here and on the server).
  const overpaid = Math.round(paidNow * 100) > Math.round(net * 100);
  // Discount cannot exceed the amount left after the CD deduction (net must stay ≥ 0).
  const discountTooBig = Math.round(discountNow * 100) > Math.round((gross - deduction) * 100);
  const isOverride = product && Number(rate) !== product.baseRate;

  const matches = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q || party.id) return [];
    const digits = q.replace(/\D/g, "");
    return data.parties
      .filter((p) => (type === "sale" ? p.kind !== "supplier" : p.kind !== "customer"))
      .filter((p) => p.name.toLowerCase().includes(q) || (digits && p.phone.replace(/\D/g, "").includes(digits)))
      .slice(0, 6);
  }, [data.parties, party.id, partyQuery, type]);
  const isNewParty = Boolean(partyQuery.trim() && !party.id && matches.length === 0);

  const chooseProduct = (id) => {
    const next = data.products.find((p) => p.id === id);
    setProductId(id);
    setRate(String(next.baseRate));
  };
  const chooseParty = (p) => {
    setParty({ id: p.id, name: p.name, phone: p.phone, address: p.address, bankAccount: p.bankAccount || "", bankIfsc: p.bankIfsc || "", gstin: p.gstin || "" });
    setPartyQuery(p.name);
    setPartyOpen(false);
  };
  const changeType = (next) => {
    setType(next);
    setPaymentMethod("Cash");
    if (next === "sale") setApplyCd(false);
    setParty(blankParty); setPartyQuery("");
  };

  // Contextual colour theme: sale = rose, purchase = amber (colour psychology).
  const contextual = settings.theme?.contextualBillThemes !== false;
  const tone = type === "sale" ? SALE_TONE : PURCHASE_TONE;
  const accent = contextual ? tone : "var(--brand)";

  // USB barcode scanner — a keyboard-wedge scan of a product code selects that grain.
  useBarcodeScanner((code) => {
    const c = code.trim().toLowerCase();
    const p = data.products.find((x) => x.id.toLowerCase() === c || (x.short || "").toLowerCase() === c || x.name.toLowerCase() === c);
    if (p) { chooseProduct(p.id); toast(`Scanned ${p.name}`, "success"); }
    else toast(`No product matches code "${code}"`, "warning");
  });

  const [showCalc, setShowCalc] = useState(false);

  const submit = async (print) => {
    setError("");
    if (!party.name.trim() || !party.phone.trim() || !party.address.trim()) return setError("Party name, contact number and address are required.");
    if (!quantity || Number(quantity) <= 0) return setError("Enter a valid grain quantity.");
    if (!rate || Number(rate) <= 0) return setError("Enter a valid rate per kg.");
    // Mirror the server floor: a positive-but-sub-gram quantity (e.g. 0.0004 kg) would post a ₹0 bill.
    if (Math.round(totalKg * 1000) <= 0) return setError("Quantity is too small to bill.");
    if (Math.round(gross * 100) <= 0) return setError("Bill amount is too small.");
    if (type === "sale" && totalKg > product.stockKg) return setError(`Insufficient stock — ${num.format(product.stockKg)} kg available.`);
    if (discountTooBig) {
      const message = "Discount is more than the bill amount.";
      toast(message, "danger");
      return setError(message);
    }
    if (overpaid) {
      const message = "Entered amount exceeds the total bill amount.";
      toast(message, "danger");
      return setError(message);
    }
    setSaving(true);
    printRef.current = print;
    try {
      await saveBill({
        type, branchId, party, productId,
        quantity: Number(quantity), unit, rate: Number(rate),
        paymentMethod, paidAmount: Number(paidAmount || 0), discount: discountNow, applyCd,
        remarks,
      }, { print, format: "a4" });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const onFormKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); submit(false); }
  };

  return (
    <Modal open onClose={onClose} size="2xl"
      title={type === "sale" ? "New sale bill" : "New purchase bill"}
      subtitle="Stock and party balance update automatically on save"
      footer={
        <div className="flex items-center justify-end gap-2 w-full">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="ghost" icon={FiPrinter} onClick={() => submit(true)} disabled={saving || overpaid || discountTooBig}>Save &amp; print</Button>
          <Button variant="primary" icon={FiSave} onClick={() => submit(false)} disabled={saving || overpaid || discountTooBig}>{saving ? "Saving…" : "Save bill"}</Button>
        </div>
      }>
      <div className="grid lg:grid-cols-[1fr_24rem] gap-6" onKeyDown={onFormKeyDown} style={contextual ? { "--accent": accent } : undefined}>
        {/* -------- form -------- */}
        <div className="space-y-5 min-w-0">
          {contextual && (
            <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: `${tone}14`, color: tone }}>
              <span className="size-2 rounded-full" style={{ background: tone }} />
              {type === "sale" ? "SALE" : "PURCHASE"} · you are recording a {type === "sale" ? "sale to a customer" : "purchase from a farmer"}
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            {[["purchase", "Purchase", FiArrowDownLeft], ["sale", "Sale", FiArrowUpRight]].map(([v, label, Icon]) => {
              const active = type === v;
              const vtone = v === "sale" ? SALE_TONE : PURCHASE_TONE;
              return (
                <button key={v} onClick={() => changeType(v)}
                  className={cx("flex items-center gap-3 p-3 rounded-xl border text-left transition-all", active ? "text-ink" : "border-line bg-surface-2 text-ink-2 hover:bg-surface-3")}
                  style={active ? { borderColor: contextual ? vtone : "var(--brand)", background: contextual ? `${vtone}12` : "color-mix(in oklab, var(--brand) 8%, var(--surface))" } : undefined}>
                  <span className="grid place-items-center size-9 rounded-lg text-white" style={{ background: active ? (contextual ? vtone : "var(--brand)") : "var(--surface-3)", color: active ? "#fff" : "var(--ink-2)" }}><Icon /></span>
                  <span><span className="block text-sm font-semibold">{label} bill</span><span className="block text-xs text-muted">{v === "sale" ? "Sell grain to a customer" : "Buy grain from a farmer"}</span></span>
                </button>
              );
            })}
          </div>

          {error && <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2.5">{error}</div>}

          {/* party */}
          <section className="space-y-3">
            <SectionLabel n="01" title="Party details" hint="Search an existing party or type new details to save automatically" />
            <div className="relative">
              <Field label="Party name *">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={partyQuery} autoComplete="off"
                    onChange={(e) => { setPartyQuery(e.target.value); setParty((c) => ({ ...c, id: "", name: e.target.value })); setPartyOpen(Boolean(e.target.value.trim())); }}
                    onFocus={() => setPartyOpen(Boolean(partyQuery.trim()))}
                    onBlur={() => setTimeout(() => setPartyOpen(false), 140)}
                    placeholder="Start typing a name or phone number…" className="input pl-9" />
                  {party.id && <Badge tone="success" icon={FiCheckCircle} className="absolute right-2 top-1/2 -translate-y-1/2">Existing</Badge>}
                </div>
              </Field>
              {partyOpen && matches.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 card p-1.5 shadow-pop max-h-64 overflow-y-auto">
                  {matches.map((p) => (
                    <button key={p.id} onMouseDown={(e) => { e.preventDefault(); chooseParty(p); }}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-2 text-left">
                      <span className="grid place-items-center size-8 rounded-lg bg-brand/10 text-brand text-xs font-bold shrink-0">{initials(p.name)}</span>
                      <span className="min-w-0 grow"><span className="block text-sm font-medium text-ink truncate">{p.name}</span><span className="block text-xs text-muted truncate">{p.phone} · {p.address}</span></span>
                      <span className="text-xs text-muted shrink-0">{p.id}</span>
                    </button>
                  ))}
                </div>
              )}
              {isNewParty && <p className="text-xs text-brand mt-1.5 flex items-center gap-1.5"><FiUser /> New party — details save automatically with this bill.</p>}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Contact number *">
                <div className="relative"><FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={party.phone} onChange={(e) => setParty((c) => ({ ...c, phone: e.target.value }))} placeholder="10-digit mobile" inputMode="tel" className="input pl-9" /></div>
              </Field>
              <Field label="Full address *">
                <div className="relative"><FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={party.address} onChange={(e) => setParty((c) => ({ ...c, address: e.target.value }))} placeholder="Village, city, district" className="input pl-9" /></div>
              </Field>
              <Field label="GSTIN (optional)">
                <input value={party.gstin} onChange={(e) => setParty((c) => ({ ...c, gstin: e.target.value.toUpperCase() }))} placeholder="e.g. 19AAACG0617G1ZD" className="input" />
              </Field>
              <Field label="Bank account (optional)">
                <div className="relative"><FiCreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={party.bankAccount} onChange={(e) => setParty((c) => ({ ...c, bankAccount: e.target.value }))} placeholder="Account number" inputMode="numeric" className="input pl-9" /></div>
              </Field>
              <Field label="IFSC (optional)">
                <input value={party.bankIfsc} onChange={(e) => setParty((c) => ({ ...c, bankIfsc: e.target.value.toUpperCase() }))} placeholder="e.g. HDFC0000123" className="input" />
              </Field>
              <Field label="Remarks (optional)" wide>
                <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any note for this bill…" className="input" />
              </Field>
            </div>
          </section>

          {/* grain */}
          <section className="space-y-3">
            <SectionLabel n="02" title="Grain & weight" hint="Select the grain, then enter the weight" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Grain / item *">
                <select value={productId} onChange={(e) => chooseProduct(e.target.value)} className="input">
                  {data.products.map((p) => <option key={p.id} value={p.id}>{productLabel(p)}</option>)}
                </select>
              </Field>
              {/* Quantity + unit combined into one control — the unit picker is a slim suffix so
                  it reads as a single "how much" field and takes far less width. */}
              <Field label="Quantity *">
                <div className="input input-affix overflow-hidden">
                  <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" className="grow outline-none h-full px-3 min-w-0" autoFocus />
                  <select value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Unit"
                    className="shrink-0 self-stretch border-l border-line bg-surface-3 text-ink-2 text-xs font-semibold pl-2.5 pr-6 outline-none cursor-pointer appearance-none rounded-r-[0.6rem]"
                    style={{ backgroundImage: "url(\"data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12' fill='none' stroke='%238a978f' stroke-width='1.5'%3e%3cpath d='M3 4.5L6 7.5L9 4.5'/%3e%3c/svg%3e\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 0.5rem center", backgroundSize: "0.7rem" }}>
                    {UNITS.map((u) => <option key={u.value} value={u.value}>{u.short || u.value}</option>)}
                  </select>
                </div>
              </Field>
            </div>
            <div className="flex items-center gap-2 text-sm bg-surface-2 border border-line rounded-xl px-3 py-2.5">
              <FiPackage className="text-muted" />
              <span className="text-ink-2">{quantity || 0} {unit} = <b className="text-ink">{num.format(totalKg)} kg</b></span>
              <span className="ml-auto text-xs text-muted">Stock: {num.format(product?.stockKg || 0)} kg</span>
            </div>
          </section>

          {/* rate + payment */}
          <section className="space-y-3">
            <SectionLabel n="03" title="Rate & payment" hint="Review the rate and record the payment made now" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Rate per kg *" error={undefined}>
                <div className={cx("input input-affix", isOverride && "border-warning")}>
                  <span className="px-3 text-muted">₹</span>
                  <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" min="0" step="0.01" className="grow outline-none h-full px-0" />
                </div>
                <span className={cx("block text-xs mt-1", isOverride ? "text-warning" : "text-muted")}>{isOverride ? `Override · base ${inr2.format(product.baseRate)}` : "Today's base rate"}</span>
              </Field>
              {!isBiller && (
                <Field label="Billing office">
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="input">{branchOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                </Field>
              )}
            </div>

            {/* Prominent payment block — this is the final money in, so it is visually emphasised
                (bold label, brand-tinted card). Payment method sits right beside it, Cash default. */}
            <div className="rounded-xl border-2 p-3.5" style={{ borderColor: `${accent}40`, background: `${accent}08` }}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="grow min-w-0">
                  <span className="block text-[0.95rem] font-bold text-ink mb-1.5">Amount paid now</span>
                  <div className={cx("input input-affix bg-surface", overpaid && "border-danger")}>
                    <span className="px-3 text-ink-2 font-bold">₹</span>
                    <input value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" className="grow outline-none h-full px-0 font-bold text-ink text-[1.05rem]" />
                    <button type="button" onClick={() => net > 0 && setPaidAmount(net.toFixed(2))} disabled={net <= 0}
                      title="Fill the full amount due" aria-label="Pay the full amount due"
                      className="shrink-0 flex items-center gap-1.5 self-stretch px-3.5 text-sm font-bold text-brand-ink bg-brand hover:bg-brand-2 rounded-r-[0.55rem] disabled:opacity-40 disabled:hover:bg-brand transition-colors">
                      <FiCheck className="text-base" /> Full
                    </button>
                  </div>
                  {overpaid && <span className="block text-xs text-danger mt-1">Exceeds the bill total.</span>}
                </div>
                <div className="sm:w-[11.5rem] shrink-0">
                  <span className="block text-xs font-semibold text-ink-2 mb-1.5">Payment method</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PAYMENT_METHODS.map((m) => {
                      const on = paymentMethod === m;
                      return (
                        <button key={m} type="button" onClick={() => setPaymentMethod(m)} aria-pressed={on}
                          className={cx(
                            "h-8 rounded-lg text-xs font-semibold border px-1.5 truncate flex items-center justify-center gap-1 transition-all duration-150 active:scale-90",
                            on
                              ? "bg-brand text-brand-ink border-brand shadow-[0_6px_16px_-8px_var(--brand)] scale-[1.03]"
                              : "bg-surface border-line text-ink-2 hover:bg-surface-3 hover:border-ink/20",
                          )}>
                          {on && <FiCheck className="text-[0.9em] shrink-0" />}
                          {PAY_SHORT[m] || m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* -------- live summary -------- */}
        <aside className="lg:sticky lg:top-0 h-fit">
          <div className="card-flat bg-surface-2 p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold text-ink">Live bill summary</p>
              <LiveClock className="text-xs mt-1" />
            </div>
            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-line">
              <span className="grid place-items-center size-12 rounded-xl bg-brand/10 text-brand text-sm font-bold">{product?.short}</span>
              <div className="min-w-0"><p className="text-base font-semibold text-ink truncate">{product?.name}</p><p className="text-sm text-muted">{num.format(totalKg)} kg × {inr2.format(Number(rate || 0))}</p></div>
            </div>
            <dl className="space-y-2.5 text-[0.95rem]">
              <Row label="Gross amount" value={inr2.format(gross)} />
              {type === "purchase" && deduction > 0 && <Row label={`CD deduction (${num.format((cdRate * 100))}%)`} value={`- ${inr2.format(deduction)}`} muted />}
              {discountNow > 0 && <Row label="Discount" value={`- ${inr2.format(discountNow)}`} muted />}
              <div className="flex items-center justify-between pt-3 border-t border-line">
                <dt className="text-base font-semibold text-ink">Net {type === "sale" ? "receivable" : "payable"}</dt>
                <dd className="text-2xl font-bold tnum" style={{ color: accent }}>{inr2.format(net)}</dd>
              </div>
              <Row label="Paid now" value={inr2.format(Number(paidAmount || 0))} muted />
              <div className="flex items-center justify-between pt-1">
                <dt className="text-ink-2">Balance due</dt>
                <dd className={cx("text-lg font-bold tnum", due > 0 ? "text-warning" : "text-success")}>{inr2.format(due)}</dd>
              </div>
            </dl>

            {/* Deduction & discount controls live here, right where their effect shows above. */}
            <div className="mt-4 pt-4 border-t border-line space-y-2.5">
              {type === "purchase" && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input type="checkbox" checked={applyCd} onChange={(e) => setApplyCd(e.target.checked)} className="size-[1.05rem] accent-[var(--brand)] shrink-0" />
                  <span className="text-sm text-ink-2 leading-tight"><b className="text-ink">Apply {num.format(cdRate * 100)}% CD</b> deduction <span className="text-muted">(above {inr2.format(cdThreshold).replace(".00", "")})</span></span>
                </label>
              )}
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input type="checkbox" checked={applyDiscount} onChange={(e) => { setApplyDiscount(e.target.checked); if (!e.target.checked) setDiscount(""); }} className="size-[1.05rem] accent-[var(--brand)] shrink-0" />
                <span className="text-sm text-ink-2 leading-tight"><FiTag className="inline -mt-0.5 mr-1 text-muted" /><b className="text-ink">Give a discount</b></span>
              </label>
              {applyDiscount && (
                <div className={cx("input input-affix bg-surface ml-6", discountTooBig && "border-danger")}>
                  <span className="px-3 text-ink-2">₹</span>
                  <input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" min="0" step="1" placeholder="Discount amount" autoFocus className="grow outline-none h-full px-0 text-sm" />
                </div>
              )}
              {applyDiscount && discountTooBig && <p className="text-xs text-danger ml-6">Discount is more than the bill amount.</p>}
            </div>

            <p className="text-xs text-muted mt-4 flex items-center gap-1.5"><FiCreditCard /> Unpaid amounts post to the party ledger.</p>
            <button type="button" onClick={() => setShowCalc((s) => !s)} className="btn btn-ghost btn-sm w-full mt-3">
              <TbCalculator className="text-[1.05em]" /> {showCalc ? "Hide" : "Show"} calculator
            </button>
            <p className="hidden lg:block text-xs text-muted mt-2">Tip: <span className="kbd">⌘</span> <span className="kbd">↵</span> to save · scan a product barcode to select it.</p>
          </div>
          {showCalc && <div className="mt-3"><Calculator onUse={(v) => setPaidAmount(String(v))} /></div>}
        </aside>
      </div>
    </Modal>
  );
}

function SectionLabel({ n, title, hint }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid place-items-center size-6 rounded-md bg-brand/10 text-brand text-[11px] font-bold">{n}</span>
      <div><h4 className="text-sm font-semibold text-ink leading-tight">{title}</h4>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
    </div>
  );
}

function Row({ label, value, muted, strong }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cx(muted ? "text-muted" : "text-ink-2")}>{label}</dt>
      <dd className={cx("tnum", strong ? "font-bold text-ink" : muted ? "text-ink-2" : "text-ink font-medium")}>{value}</dd>
    </div>
  );
}
