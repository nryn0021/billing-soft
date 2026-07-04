import { useMemo, useRef, useState } from "react";
import {
  FiArrowDownLeft, FiArrowUpRight, FiCheck, FiCheckCircle, FiCreditCard, FiMapPin, FiPackage,
  FiPhone, FiPrinter, FiSave, FiSearch, FiUser,
} from "react-icons/fi";
import { TbCalculator } from "react-icons/tb";
import { useApp } from "../context/AppContext";
import { Badge, Button, Field, Modal, cx } from "../ui";
import { PAYMENT_METHODS, UNITS, inr2, kgPerUnit, num, productLabel, initials } from "../lib/format";
import { useBarcodeScanner } from "../lib/hooks";
import { Calculator } from "./Calculator";

const blankParty = { id: "", name: "", phone: "", address: "", bankAccount: "", bankIfsc: "" };
const SALE_TONE = "#d6336c"; // lotus / rose
const PURCHASE_TONE = "#c98a1f"; // warm golden amber

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
  const [paymentMethod, setPaymentMethod] = useState(initialType === "purchase" ? "Cash" : "Online / Bank");
  const [paidAmount, setPaidAmount] = useState("");
  const [applyCd, setApplyCd] = useState(false); // default OFF — only applied when manually enabled
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
  const deduction = type === "purchase" && applyCd && gross > 20000 ? gross * 0.025 : 0;
  const net = gross - deduction;
  const paidNow = Number(paidAmount || 0);
  const due = Math.max(0, net - paidNow);
  // Overpayment guard: compare in paise to avoid float noise. There is no advance/credit
  // facility, so paying more than the bill total is blocked (both here and on the server).
  const overpaid = Math.round(paidNow * 100) > Math.round(net * 100);
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
    setParty({ id: p.id, name: p.name, phone: p.phone, address: p.address, bankAccount: p.bankAccount || "", bankIfsc: p.bankIfsc || "" });
    setPartyQuery(p.name);
    setPartyOpen(false);
  };
  const changeType = (next) => {
    setType(next);
    setPaymentMethod(next === "purchase" ? "Cash" : "Online / Bank");
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
    if (type === "sale" && totalKg > product.stockKg) return setError(`Insufficient stock — ${num.format(product.stockKg)} kg available.`);
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
        paymentMethod, paidAmount: Number(paidAmount || 0), applyCd,
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
    <Modal open onClose={onClose} size="xl"
      title={type === "sale" ? "New sale bill" : "New purchase bill"}
      subtitle="Stock and party balance update automatically on save"
      footer={
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full">
          {/* CD deduction — DEFAULT OFF, at the bottom beside Save (purchase only) */}
          {type === "purchase" ? (
            <label className="flex items-center gap-2.5 mr-auto cursor-pointer select-none px-1">
              <input type="checkbox" checked={applyCd} onChange={(e) => setApplyCd(e.target.checked)} className="size-4 accent-[var(--brand)]" />
              <span className="text-sm text-ink-2"><b className="text-ink">Apply 2.5% CD deduction</b> on purchases above ₹20,000</span>
            </label>
          ) : <span className="mr-auto" />}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="ghost" icon={FiPrinter} onClick={() => submit(true)} disabled={saving || overpaid}>Save &amp; print</Button>
            <Button variant="primary" icon={FiSave} onClick={() => submit(false)} disabled={saving || overpaid}>{saving ? "Saving…" : "Save bill"}</Button>
          </div>
        </div>
      }>
      <div className="grid lg:grid-cols-[1fr_20rem] gap-5" onKeyDown={onFormKeyDown} style={contextual ? { "--accent": accent } : undefined}>
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
              <Field label="Bank account (optional)">
                <div className="relative"><FiCreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={party.bankAccount} onChange={(e) => setParty((c) => ({ ...c, bankAccount: e.target.value }))} placeholder="Account number" inputMode="numeric" className="input pl-9" /></div>
              </Field>
              <Field label="IFSC (optional)">
                <input value={party.bankIfsc} onChange={(e) => setParty((c) => ({ ...c, bankIfsc: e.target.value.toUpperCase() }))} placeholder="e.g. HDFC0000123" className="input" />
              </Field>
            </div>
          </section>

          {/* grain */}
          <section className="space-y-3">
            <SectionLabel n="02" title="Grain & weight" hint="Select the grain, then enter the weight" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Grain / item *" wide>
                <select value={productId} onChange={(e) => chooseProduct(e.target.value)} className="input">
                  {data.products.map((p) => <option key={p.id} value={p.id}>{productLabel(p)}</option>)}
                </select>
              </Field>
              <Field label="Quantity *">
                <input value={quantity} onChange={(e) => setQuantity(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" className="input" autoFocus />
              </Field>
              <Field label="Unit *">
                <select value={unit} onChange={(e) => setUnit(e.target.value)} className="input">{UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select>
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
            <SectionLabel n="03" title="Rate & payment" hint="Review the rate and record any payment made now" />
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Rate per kg *" error={undefined}>
                <div className={cx("input input-affix", isOverride && "border-warning")}>
                  <span className="px-3 text-muted">₹</span>
                  <input value={rate} onChange={(e) => setRate(e.target.value)} type="number" min="0" step="0.01" className="grow outline-none h-full px-0" />
                </div>
                <span className={cx("block text-xs mt-1", isOverride ? "text-warning" : "text-muted")}>{isOverride ? `Override · base ${inr2.format(product.baseRate)}` : "Today's base rate"}</span>
              </Field>
              <Field label="Payment method">
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input">{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select>
              </Field>
              <Field label="Amount paid now" error={overpaid ? "Exceeds the bill total." : undefined}>
                <div className={cx("input input-affix", overpaid && "border-danger")}>
                  <span className="px-3 text-muted">₹</span>
                  <input value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" className="grow outline-none h-full px-0" />
                  <button type="button" onClick={() => net > 0 && setPaidAmount(net.toFixed(2))} disabled={net <= 0}
                    title="Pay full amount" aria-label="Fill in the full bill amount"
                    className="shrink-0 grid place-items-center self-stretch px-3 text-brand border-l border-line hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent">
                    <FiCheck />
                  </button>
                </div>
              </Field>
            </div>
            {!isBiller && (
              <Field label="Billing office">
                <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="input sm:max-w-xs">{branchOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
              </Field>
            )}
          </section>
        </div>

        {/* -------- live summary -------- */}
        <aside className="lg:sticky lg:top-0 h-fit">
          <div className="card-flat bg-surface-2 p-4">
            <p className="text-xs font-semibold text-ink-2 mb-3">Live bill summary</p>
            <div className="flex items-center gap-3 pb-3 mb-3 border-b border-line">
              <span className="grid place-items-center size-10 rounded-xl bg-brand/10 text-brand text-xs font-bold">{product?.short}</span>
              <div className="min-w-0"><p className="text-sm font-semibold text-ink truncate">{product?.name}</p><p className="text-xs text-muted">{num.format(totalKg)} kg × {inr2.format(Number(rate || 0))}</p></div>
            </div>
            <dl className="space-y-2 text-sm">
              <Row label="Gross amount" value={inr2.format(gross)} />
              {type === "purchase" && <Row label={`CD deduction${deduction ? " (2.5%)" : ""}`} value={`- ${inr2.format(deduction)}`} muted />}
              <div className="flex items-center justify-between pt-2 border-t border-line">
                <dt className="font-semibold text-ink">Net {type === "sale" ? "receivable" : "payable"}</dt>
                <dd className="text-lg font-bold tnum" style={{ color: accent }}>{inr2.format(net)}</dd>
              </div>
              <Row label="Paid now" value={inr2.format(Number(paidAmount || 0))} muted />
              <Row label="Balance due" value={inr2.format(due)} strong />
            </dl>
            <p className="text-xs text-muted mt-3 flex items-center gap-1.5"><FiCreditCard /> Unpaid amounts post to the party ledger.</p>
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
