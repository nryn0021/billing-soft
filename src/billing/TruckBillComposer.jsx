import { useMemo, useState } from "react";
import {
  FiCheck, FiCheckCircle, FiCreditCard, FiFileText, FiLayers, FiMapPin, FiPhone, FiPlus, FiPrinter, FiSave,
  FiSearch, FiTruck, FiUser, FiX,
} from "react-icons/fi";
import { useApp } from "../context/AppContext";
import { Badge, Button, Field, LiveClock, Modal, cx } from "../ui";
import { PAYMENT_METHODS, inr2, num, productLabel, initials } from "../lib/format";

const TRUCK_TONE = "#2a78d6"; // blue — the "truck sale" accent
const blankParty = { id: "", name: "", phone: "", address: "", bankAccount: "", bankIfsc: "", gstin: "" };
const numOr0 = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 0; };
// Signed money parser — a leading "-" makes the charge deduct from the bill total.
const numSigned = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/**
 * Detailed lorry/rice-mill sale composer. Captures everything on the mill's paper
 * "Bill of Supply" (GST) and transport "Challan" — consignee GSTIN, HSN, vehicle,
 * driver/owner, freight, bhara, advance — and posts an ordinary sale bill (so stock &
 * ledger stay correct) with all the extra fields stored in the bill's `meta`.
 */
export function TruckBillComposer({ defaultBranch, onClose }) {
  const { user, data, saveBill, saveTransporter, saveVehicle, settings } = useApp();
  const isBiller = user.role === "biller";

  const [party, setParty] = useState(blankParty);
  const [partyQuery, setPartyQuery] = useState("");
  const [partyOpen, setPartyOpen] = useState(false);
  const [buyerGstin, setBuyerGstin] = useState("");

  const firstProduct = data.products.find((p) => /maize|makk|corn/i.test(p.name)) || data.products[0];
  const [productId, setProductId] = useState(firstProduct?.id || "");
  const product = data.products.find((p) => p.id === productId) || firstProduct;
  const [hsnCode, setHsnCode] = useState(firstProduct?.hsn || "1005");
  const [bags, setBags] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [ratePerQtl, setRatePerQtl] = useState(String(((firstProduct?.baseRate || 0) * 100) || ""));

  // charges added into the Bill-of-Supply total. All three are SIGNED — enter a negative
  // value (e.g. -500) to deduct it from the grand total instead of adding it.
  const [loadingCharge, setLoadingCharge] = useState("");
  const [bharaAdv, setBharaAdv] = useState("");
  const [bharaLess, setBharaLess] = useState("");
  const [discount, setDiscount] = useState("");

  // transport / challan
  const [transportName, setTransportName] = useState("");
  const [transportMob, setTransportMob] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverMob, setDriverMob] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerMob, setOwnerMob] = useState("");
  const [dlNo, setDlNo] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [freight, setFreight] = useState("");
  const [bhara, setBhara] = useState("");
  const [advance, setAdvance] = useState("");
  const [brokerName, setBrokerName] = useState("");
  const [brokerMob, setBrokerMob] = useState("");

  // saved-master selection (transporter + vehicle)
  const [transporterId, setTransporterId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [savingMaster, setSavingMaster] = useState("");

  // payment + remarks (invoice/challan numbers are now auto-assigned by the server)
  const [placeOfSupply, setPlaceOfSupply] = useState(settings.business?.city || "");
  const [paymentMethod, setPaymentMethod] = useState("Credit");
  const [paidAmount, setPaidAmount] = useState("");
  const [remarks, setRemarks] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const branchOptions = data.branches;
  const fixedBranch = branchOptions.find((b) => b.id === user.branchId);
  const [branchId, setBranchId] = useState(
    isBiller ? (fixedBranch?.id || branchOptions[0]?.id)
      : (branchOptions.find((b) => b.name === defaultBranch)?.id || branchOptions[0]?.id),
  );

  // Weight (kg) × rate (per quintal). Internally the core bill uses rate per kg = perQtl/100.
  const weight = numOr0(weightKg);
  const rateQtl = numOr0(ratePerQtl);
  const ratePerKg = rateQtl / 100;
  const amount = weight * ratePerKg; // = weight/100 × ratePerQtl
  const discountNow = numOr0(discount);
  // Signed adjustments folded into the Bill-of-Supply total (negative → deduction).
  const loadingNow = numSigned(loadingCharge);
  const bharaAdvNow = numSigned(bharaAdv);
  const bharaLessNow = numSigned(bharaLess);
  const adjustments = loadingNow + bharaAdvNow + bharaLessNow;
  const net = amount - discountNow + adjustments;
  const paidNow = numOr0(paidAmount);
  const due = Math.max(0, net - paidNow);
  const overpaid = Math.round(paidNow * 100) > Math.round(net * 100);
  const discountTooBig = Math.round(discountNow * 100) > Math.round(amount * 100);
  const netInvalid = Math.round(net * 100) < 0; // charges/discount pushed the total below zero
  const blocked = saving || overpaid || discountTooBig || netInvalid; // disables every save/print action

  const toPay = Math.max(0, numOr0(bhara) - numOr0(advance));

  // Auto-assigned document numbers (previewed from the server's current counters).
  const nextInvoiceNo = `${data.serials?.invoice?.prefix || ""}${data.serials?.invoice?.next ?? "—"}`;
  const nextChallanNo = `${data.serials?.challan?.prefix || ""}${data.serials?.challan?.next ?? "—"}`;

  const matches = useMemo(() => {
    const q = partyQuery.trim().toLowerCase();
    if (!q || party.id) return [];
    const digits = q.replace(/\D/g, "");
    return data.parties
      .filter((p) => p.kind !== "supplier")
      .filter((p) => p.name.toLowerCase().includes(q) || (digits && p.phone.replace(/\D/g, "").includes(digits)))
      .slice(0, 6);
  }, [data.parties, party.id, partyQuery]);
  const isNewParty = Boolean(partyQuery.trim() && !party.id && matches.length === 0);

  const chooseParty = (p) => {
    setParty({ id: p.id, name: p.name, phone: p.phone, address: p.address, bankAccount: p.bankAccount || "", bankIfsc: p.bankIfsc || "", gstin: p.gstin || "" });
    setPartyQuery(p.name);
    setPartyOpen(false);
    if (p.gstin) setBuyerGstin(p.gstin); // pre-fill the buyer GSTIN from the saved party
  };

  // Selecting a saved transporter / vehicle fills the transport section (still editable).
  const chooseTransporter = (id) => {
    setTransporterId(id);
    const t = data.transporters?.find((x) => x.id === id);
    if (t) { setTransportName(t.name); setTransportMob(t.phone || ""); }
  };
  const chooseVehicle = (id) => {
    setVehicleId(id);
    const v = data.vehicles?.find((x) => x.id === id);
    if (v) {
      setVehicleNo(v.vehicleNo);
      setOwnerName(v.ownerName || ""); setOwnerMob(v.ownerMob || "");
      setDriverName(v.driverName || ""); setDriverMob(v.driverMob || "");
      setDlNo(v.dlNo || ""); setAadhaar(v.aadhaar || "");
    }
  };
  const saveNewTransporter = async () => {
    if (!transportName.trim()) return setError("Enter a transport name to save it.");
    setSavingMaster("transporter"); setError("");
    try { await saveTransporter({ name: transportName.trim(), phone: transportMob.trim() }); }
    catch (e) { setError(e.message); }
    finally { setSavingMaster(""); }
  };
  const saveNewVehicle = async () => {
    if (!vehicleNo.trim()) return setError("Enter a vehicle number to save it.");
    setSavingMaster("vehicle"); setError("");
    try { await saveVehicle({ vehicleNo: vehicleNo.trim(), ownerName, ownerMob, driverName, driverMob, dlNo, aadhaar }); }
    catch (e) { setError(e.message); }
    finally { setSavingMaster(""); }
  };

  const buildMeta = () => ({
    buyerGstin, hsnCode, placeOfSupply,
    bags: numOr0(bags),
    transportName, transportMob, vehicleNo, driverName, driverMob, ownerName, ownerMob, dlNo,
    brokerName, brokerMob,
    loadingCharge: loadingNow, bharaAdv: bharaAdvNow, bharaLess: bharaLessNow,
    freight: numOr0(freight), bhara: numOr0(bhara), advance: numOr0(advance), toPay,
  });

  const submit = async (printFormat) => {
    setError("");
    if (!party.name.trim() || !party.phone.trim() || !party.address.trim()) return setError("Consignee name, mobile and address are required.");
    if (weight <= 0) return setError("Enter the net weight (kg).");
    if (rateQtl <= 0) return setError("Enter the rate per quintal.");
    if (product && weight > product.stockKg) return setError(`Insufficient stock — ${num.format(product.stockKg)} kg available.`);
    if (discountTooBig) return setError("Discount is more than the bill amount.");
    if (netInvalid) return setError("Charges and discount cannot push the total below zero.");
    if (overpaid) return setError("Amount paid exceeds the bill total.");
    setSaving(true);
    try {
      await saveBill({
        type: "sale", kind: "truck", branchId, productId,
        party: { ...party, gstin: buyerGstin },
        quantity: weight, unit: "kg", rate: ratePerKg,
        paymentMethod, paidAmount: paidNow, discount: discountNow,
        remarks,
        meta: buildMeta(),
      }, printFormat ? { print: true, format: printFormat } : {});
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} size="3xl"
      title={<span className="flex items-center gap-2"><FiTruck style={{ color: TRUCK_TONE }} /> New truck sale</span>}
      subtitle="Detailed GST Bill of Supply + transport Challan for lorry loads"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 w-full">
          <Button variant="ghost" icon={FiX} onClick={onClose}>Cancel</Button>
          <Button variant="ghost" icon={FiSave} onClick={() => submit(null)} disabled={blocked}>{saving ? "Saving…" : "Save only"}</Button>
          <Button variant="ghost" icon={FiPrinter} onClick={() => submit("challan")} disabled={blocked}>Print + Challan</Button>
          <Button variant="ghost" icon={FiFileText} onClick={() => submit("gst")} disabled={blocked}>Print + Bill of Supply</Button>
          <Button variant="primary" icon={FiLayers} onClick={() => submit("challan+gst")} disabled={blocked}>Print + Challan &amp; Bill of Supply</Button>
        </div>
      }>
      <div className="grid lg:grid-cols-[1fr_22rem] gap-6" style={{ "--accent": TRUCK_TONE }}>
        <div className="space-y-5 min-w-0">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold" style={{ background: `${TRUCK_TONE}14`, color: TRUCK_TONE }}>
            <FiTruck /> TRUCK SALE · supply to rice mill / trader by lorry
          </div>
          {error && <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2.5">{error}</div>}

          {/* consignee */}
          <section className="space-y-3">
            <SectionLabel n="01" title="Consignee (buyer) details" hint="Name & address printed on the Bill of Supply" />
            <div className="relative">
              <Field label="Buyer name *">
                <div className="relative">
                  <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={partyQuery} autoComplete="off"
                    onChange={(e) => { setPartyQuery(e.target.value); setParty((c) => ({ ...c, id: "", name: e.target.value })); setPartyOpen(Boolean(e.target.value.trim())); }}
                    onFocus={() => setPartyOpen(Boolean(partyQuery.trim()))}
                    onBlur={() => setTimeout(() => setPartyOpen(false), 140)}
                    placeholder="e.g. Godrej Agrovet Ltd" className="input pl-9" />
                  {party.id && <Badge tone="success" icon={FiCheckCircle} className="absolute right-2 top-1/2 -translate-y-1/2">Existing</Badge>}
                </div>
              </Field>
              {partyOpen && matches.length > 0 && (
                <div className="absolute z-20 left-0 right-0 mt-1 card p-1.5 shadow-pop max-h-64 overflow-y-auto">
                  {matches.map((p) => (
                    <button key={p.id} onMouseDown={(e) => { e.preventDefault(); chooseParty(p); }}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-2 text-left">
                      <span className="grid place-items-center size-8 rounded-lg bg-info/10 text-info text-xs font-bold shrink-0">{initials(p.name)}</span>
                      <span className="min-w-0 grow"><span className="block text-sm font-medium text-ink truncate">{p.name}</span><span className="block text-xs text-muted truncate">{p.phone} · {p.address}</span></span>
                    </button>
                  ))}
                </div>
              )}
              {isNewParty && <p className="text-xs text-info mt-1.5 flex items-center gap-1.5"><FiUser /> New buyer — saved automatically with this bill.</p>}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Mobile number *">
                <div className="relative"><FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={party.phone} onChange={(e) => setParty((c) => ({ ...c, phone: e.target.value }))} placeholder="10-digit mobile" inputMode="tel" className="input pl-9" /></div>
              </Field>
              <Field label="GSTIN (buyer)">
                <input value={buyerGstin} onChange={(e) => setBuyerGstin(e.target.value.toUpperCase())} placeholder="e.g. 19AAACG0617G1ZD" className="input" />
              </Field>
              <Field label="Full address *" className="sm:col-span-2">
                <div className="relative"><FiMapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input value={party.address} onChange={(e) => setParty((c) => ({ ...c, address: e.target.value }))} placeholder="Buyer address, city, PIN" className="input pl-9" /></div>
              </Field>
            </div>
          </section>

          {/* goods */}
          <section className="space-y-3">
            <SectionLabel n="02" title="Goods" hint="Weight in kg × rate per quintal = amount" />
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Grain / item *">
                <select value={productId} onChange={(e) => setProductId(e.target.value)} className="input">
                  {data.products.map((p) => <option key={p.id} value={p.id}>{productLabel(p)}</option>)}
                </select>
              </Field>
              <Field label="HSN code">
                <input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} placeholder="e.g. 1005" className="input" />
              </Field>
              <Field label="Quantity (bags)">
                <input value={bags} onChange={(e) => setBags(e.target.value)} type="number" min="0" step="1" placeholder="e.g. 400" className="input" />
              </Field>
              <Field label="Net weight (kg) *">
                <input value={weightKg} onChange={(e) => setWeightKg(e.target.value)} type="number" min="0" step="0.01" placeholder="e.g. 23645" className="input" />
              </Field>
              <Field label="Rate (₹ / quintal) *">
                <div className="input input-affix">
                  <span className="px-3 text-muted">₹</span>
                  <input value={ratePerQtl} onChange={(e) => setRatePerQtl(e.target.value)} type="number" min="0" step="0.01" placeholder="e.g. 2370" className="grow outline-none h-full px-0" />
                </div>
              </Field>
              <Field label="Amount (auto)">
                <div className="input flex items-center font-semibold text-ink tnum bg-surface-3">{inr2.format(amount)}</div>
              </Field>
            </div>
            <p className="text-xs text-muted">Stock: {num.format(product?.stockKg || 0)} kg available · {weight ? `${num.format(weight / 100)} qtl` : "—"}</p>
          </section>

          {/* transport / challan */}
          <section className="space-y-3">
            <SectionLabel n="03" title="Transport & Challan" hint="Pick a saved transporter / vehicle or type new details" />
            {/* Transporter master picker */}
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Saved transporter">
                <select value={transporterId} onChange={(e) => chooseTransporter(e.target.value)} className="input">
                  <option value="">— Choose saved transporter —</option>
                  {(data.transporters || []).map((t) => <option key={t.id} value={t.id}>{t.name}{t.phone ? ` · ${t.phone}` : ""}</option>)}
                </select>
              </Field>
              <Field label="Saved vehicle">
                <select value={vehicleId} onChange={(e) => chooseVehicle(e.target.value)} className="input">
                  <option value="">— Choose saved vehicle —</option>
                  {(data.vehicles || []).map((v) => <option key={v.id} value={v.id}>{v.vehicleNo}{v.driverName ? ` · ${v.driverName}` : ""}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Transport name"><input value={transportName} onChange={(e) => { setTransportName(e.target.value); setTransporterId(""); }} placeholder="e.g. Kishan Transport" className="input" /></Field>
              <Field label="Transport mobile"><input value={transportMob} onChange={(e) => setTransportMob(e.target.value)} inputMode="tel" placeholder="Mobile" className="input" /></Field>
            </div>
            <div className="flex justify-end -mt-1">
              <button type="button" onClick={saveNewTransporter} disabled={savingMaster === "transporter" || !transportName.trim()}
                className="text-xs font-semibold text-info hover:underline disabled:opacity-40 disabled:no-underline flex items-center gap-1">
                <FiPlus /> {savingMaster === "transporter" ? "Saving…" : "Save as new transporter"}
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Vehicle no."><input value={vehicleNo} onChange={(e) => { setVehicleNo(e.target.value.toUpperCase()); setVehicleId(""); }} placeholder="e.g. WB29B 4163" className="input" /></Field>
              <Field label="Driver name"><input value={driverName} onChange={(e) => setDriverName(e.target.value)} placeholder="Driver" className="input" /></Field>
              <Field label="Driver mobile"><input value={driverMob} onChange={(e) => setDriverMob(e.target.value)} inputMode="tel" placeholder="Mobile" className="input" /></Field>
              <Field label="Vehicle owner"><input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Owner" className="input" /></Field>
              <Field label="Owner mobile"><input value={ownerMob} onChange={(e) => setOwnerMob(e.target.value)} inputMode="tel" placeholder="Mobile" className="input" /></Field>
              <Field label="Driving licence no."><input value={dlNo} onChange={(e) => setDlNo(e.target.value.toUpperCase())} placeholder="D.L. No." className="input" /></Field>
              <Field label="Aadhaar no. (optional)"><input value={aadhaar} onChange={(e) => setAadhaar(e.target.value)} inputMode="numeric" placeholder="12-digit Aadhaar" className="input" /></Field>
              <Field label="Place of supply"><input value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)} placeholder="e.g. Amarpur" className="input" /></Field>
            </div>
            <div className="flex justify-end -mt-1">
              <button type="button" onClick={saveNewVehicle} disabled={savingMaster === "vehicle" || !vehicleNo.trim()}
                className="text-xs font-semibold text-info hover:underline disabled:opacity-40 disabled:no-underline flex items-center gap-1">
                <FiPlus /> {savingMaster === "vehicle" ? "Saving…" : "Save as new vehicle"}
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="Freight (₹)"><input value={freight} onChange={(e) => setFreight(e.target.value)} type="number" min="0" placeholder="0" className="input" /></Field>
              <Field label="Bhara (₹)"><input value={bhara} onChange={(e) => setBhara(e.target.value)} type="number" min="0" placeholder="0" className="input" /></Field>
              <Field label="Advance (₹)"><input value={advance} onChange={(e) => setAdvance(e.target.value)} type="number" min="0" placeholder="0" className="input" /></Field>
              <Field label="To pay (auto)"><div className="input flex items-center tnum text-ink font-medium bg-surface-3">{inr2.format(toPay)}</div></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Broker name"><input value={brokerName} onChange={(e) => setBrokerName(e.target.value)} placeholder="e.g. Kamal Singh" className="input" /></Field>
              <Field label="Broker mobile"><input value={brokerMob} onChange={(e) => setBrokerMob(e.target.value)} inputMode="tel" placeholder="Mobile" className="input" /></Field>
            </div>
          </section>

          {/* numbers + payment */}
          <section className="space-y-3">
            <SectionLabel n="04" title="Bill numbers & payment" hint="Invoice & challan numbers are assigned automatically" />
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Invoice no. (Bill of Supply)"><div className="input flex items-center font-semibold text-ink tnum bg-surface-3">{nextInvoiceNo}</div></Field>
              <Field label="Challan no."><div className="input flex items-center font-semibold text-ink tnum bg-surface-3">{nextChallanNo}</div></Field>
              {!isBiller && (
                <Field label="Billing office">
                  <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="input">{branchOptions.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
                </Field>
              )}
            </div>
            <p className="text-xs text-muted -mt-1">Next numbers shown above — configure or reset them in Settings → Billing &amp; tax.</p>
            <div className="rounded-xl border-2 p-3.5" style={{ borderColor: `${TRUCK_TONE}40`, background: `${TRUCK_TONE}08` }}>
              <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                <div className="grow min-w-0">
                  <span className="block text-[0.95rem] font-bold text-ink mb-1.5">Amount paid now</span>
                  <div className={cx("input input-affix bg-surface", overpaid && "border-danger")}>
                    <span className="px-3 text-ink-2 font-bold">₹</span>
                    <input value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)} type="number" min="0" step="0.01" placeholder="0.00" className="grow outline-none h-full px-0 font-bold text-ink text-[1.05rem]" />
                    <button type="button" onClick={() => net > 0 && setPaidAmount(net.toFixed(2))} disabled={net <= 0}
                      className="shrink-0 flex items-center gap-1.5 self-stretch px-3.5 text-sm font-bold text-brand-ink bg-brand hover:bg-brand-2 rounded-r-[0.55rem] disabled:opacity-40 transition-colors">
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
                          {m.split(" ")[0]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Three signed adjustments — enter a negative value (e.g. -500) to deduct. */}
              <div className="grid grid-cols-3 gap-3 mt-3">
                <Field label="Loading charge (₹)"><input value={loadingCharge} onChange={(e) => setLoadingCharge(e.target.value)} type="number" step="any" placeholder="0" className="input bg-surface" /></Field>
                <Field label="Bhara Adv (₹)"><input value={bharaAdv} onChange={(e) => setBharaAdv(e.target.value)} type="number" step="any" placeholder="0" className="input bg-surface" /></Field>
                <Field label="Bhada Less (₹)"><input value={bharaLess} onChange={(e) => setBharaLess(e.target.value)} type="number" step="any" placeholder="0" className="input bg-surface" /></Field>
              </div>
              <p className="text-[11px] text-muted mt-1.5">Tip: type a minus sign (e.g. <b>-500</b>) on any of the three to deduct it from the total.</p>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <Field label="Discount (₹)" error={discountTooBig ? "More than the amount." : undefined}>
                  <input value={discount} onChange={(e) => setDiscount(e.target.value)} type="number" min="0" placeholder="0" className={cx("input bg-surface", discountTooBig && "border-danger")} />
                </Field>
              </div>
              <Field label="Remarks (optional)" className="mt-3">
                <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Any note for this bill…" className="input h-16 py-2 bg-surface" />
              </Field>
            </div>
          </section>
        </div>

        {/* live summary */}
        <aside className="lg:sticky lg:top-0 h-fit">
          <div className="card-flat bg-surface-2 p-5">
            <div className="mb-4">
              <p className="text-sm font-semibold text-ink flex items-center gap-2"><FiTruck style={{ color: TRUCK_TONE }} /> Bill of Supply</p>
              <LiveClock className="text-xs mt-1" />
            </div>
            <div className="flex items-center gap-3 pb-4 mb-4 border-b border-line">
              <span className="grid place-items-center size-12 rounded-xl text-white text-sm font-bold" style={{ background: TRUCK_TONE }}>{product?.short}</span>
              <div className="min-w-0"><p className="text-base font-semibold text-ink truncate">{product?.name}</p><p className="text-sm text-muted">{bags || 0} bags · {num.format(weight)} kg</p></div>
            </div>
            <dl className="space-y-2.5 text-[0.95rem]">
              <Row label="Weight × rate" value={`${num.format(weight)}kg × ₹${num.format(rateQtl)}/qtl`} muted />
              <Row label="Goods amount" value={inr2.format(amount)} />
              {discountNow > 0 && <Row label="Discount" value={`- ${inr2.format(discountNow)}`} muted />}
              {loadingNow !== 0 && <Row label="Loading charge" value={`${loadingNow < 0 ? "- " : "+ "}${inr2.format(Math.abs(loadingNow))}`} muted />}
              {bharaAdvNow !== 0 && <Row label="Bhara Adv" value={`${bharaAdvNow < 0 ? "- " : "+ "}${inr2.format(Math.abs(bharaAdvNow))}`} muted />}
              {bharaLessNow !== 0 && <Row label="Bhada Less" value={`${bharaLessNow < 0 ? "- " : "+ "}${inr2.format(Math.abs(bharaLessNow))}`} muted />}
              <div className="flex items-center justify-between pt-3 border-t border-line">
                <dt className="text-base font-semibold text-ink">Grand total</dt>
                <dd className="text-2xl font-bold tnum" style={{ color: netInvalid ? "var(--danger)" : TRUCK_TONE }}>{inr2.format(net)}</dd>
              </div>
              <Row label="Paid now" value={inr2.format(paidNow)} muted />
              <div className="flex items-center justify-between">
                <dt className="text-ink-2">Balance due</dt>
                <dd className={cx("text-lg font-bold tnum", due > 0 ? "text-warning" : "text-success")}>{inr2.format(due)}</dd>
              </div>
            </dl>
            <div className="mt-4 pt-4 border-t border-line space-y-1.5 text-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-muted mb-1">Transport (challan)</p>
              <Row label="Freight" value={inr2.format(numOr0(freight))} muted />
              <Row label="Bhara" value={inr2.format(numOr0(bhara))} muted />
              <Row label="Advance" value={`- ${inr2.format(numOr0(advance))}`} muted />
              <div className="flex items-center justify-between font-semibold">
                <dt className="text-ink-2">To pay (driver)</dt><dd className="tnum text-ink">{inr2.format(toPay)}</dd>
              </div>
            </div>
            <p className="text-xs text-muted mt-4 flex items-center gap-1.5"><FiCreditCard /> Unpaid amount posts to the buyer's ledger.</p>
          </div>
        </aside>
      </div>
    </Modal>
  );
}

function SectionLabel({ n, title, hint }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid place-items-center size-6 rounded-md text-white text-[11px] font-bold" style={{ background: TRUCK_TONE }}>{n}</span>
      <div><h4 className="text-sm font-semibold text-ink leading-tight">{title}</h4>{hint && <p className="text-xs text-muted">{hint}</p>}</div>
    </div>
  );
}

function Row({ label, value, muted }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cx(muted ? "text-muted" : "text-ink-2")}>{label}</dt>
      <dd className={cx("tnum", muted ? "text-ink-2" : "text-ink font-medium")}>{value}</dd>
    </div>
  );
}
