import { useCallback, useEffect, useMemo, useState } from "react";
import { useBlocker } from "react-router-dom";
import {
  FiAlertTriangle, FiBell, FiCheckCircle, FiCreditCard, FiHash, FiHome, FiKey, FiLayers, FiLock, FiMonitor, FiMoon,
  FiPrinter, FiShield, FiSliders, FiSun, FiFileText,
} from "react-icons/fi";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { Avatar, Badge, Button, Card, Field, Modal, Toggle, cx } from "../ui";
import { makeQr, upiUri } from "../lib/qr";
import { PAYMENT_METHODS } from "../lib/format";
import { ADMIN_LOCKED_PERMISSIONS, PERMISSION_CATALOG, defaultRolePermissions } from "../lib/permissions";

const TABS = [
  { id: "business", label: "Business", icon: FiHome },
  { id: "bank", label: "Bank & UPI", icon: FiCreditCard },
  { id: "invoice", label: "Invoice", icon: FiFileText },
  { id: "documents", label: "Documents", icon: FiLayers },
  { id: "printing", label: "Printing", icon: FiPrinter },
  { id: "billing", label: "Billing & tax", icon: FiSliders },
  { id: "notifications", label: "Notifications", icon: FiBell },
  { id: "permissions", label: "Roles & Access", icon: FiShield },
  { id: "appearance", label: "Appearance", icon: FiMonitor },
  { id: "security", label: "Security", icon: FiKey },
];

export default function Settings() {
  const { settings, saveSettings, can, data } = useApp();
  const editable = can("settings.manage");
  const [tab, setTab] = useState("business");
  const [form, setForm] = useState(() => structuredClone(settings));
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(structuredClone(settings)); }, [settings]);
  const patch = (section, value) => setForm((f) => ({ ...f, [section]: value }));
  const save = async (keys) => {
    setSaving(true);
    try { await saveSettings(Object.fromEntries(keys.map((k) => [k, form[k]]))); } finally { setSaving(false); }
  };

  // -------- unsaved-changes guard --------
  // Which top-level settings sections were edited but not yet saved.
  const changedKeys = useMemo(
    () => Object.keys(form).filter((k) => JSON.stringify(form[k]) !== JSON.stringify(settings[k])),
    [form, settings],
  );
  const dirty = editable && changedKeys.length > 0;

  // Block in-app navigation away from Settings while there are unsaved edits.
  const blocker = useBlocker(
    useCallback(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname, [dirty]),
  );

  // Warn on browser refresh / tab close too.
  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const saveAndLeave = async () => {
    if (changedKeys.length) await save(changedKeys);
    blocker.proceed?.();
  };

  return (
    <>
    <div className="grid lg:grid-cols-[15rem_1fr] gap-4 max-w-[1200px] mx-auto">
      <aside className="lg:sticky lg:top-20 h-fit">
        <div className="lg:hidden mb-2"><select value={tab} onChange={(e) => setTab(e.target.value)} className="input">{TABS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></div>
        <Card className="hidden lg:block p-2">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={cx("w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors", tab === t.id ? "bg-brand/10 text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink")}>
              <t.icon className="text-base shrink-0" />{t.label}
            </button>
          ))}
        </Card>
      </aside>

      <div className="min-w-0">
        {!editable && tab !== "security" && (
          <div className="mb-4 text-sm text-ink-2 bg-warning/10 border border-warning/25 rounded-xl px-3 py-2.5">You have view-only access to settings.</div>
        )}
        {tab === "business" && <BusinessTab form={form} patch={patch} editable={editable} onSave={() => save(["business"])} saving={saving} />}
        {tab === "bank" && <BankTab form={form} patch={patch} editable={editable} onSave={() => save(["bank"])} saving={saving} />}
        {tab === "invoice" && <InvoiceTab form={form} patch={patch} editable={editable} onSave={() => save(["invoice"])} saving={saving} />}
        {tab === "documents" && <DocumentsTab form={form} patch={patch} editable={editable} onSave={() => save(["documents", "billing", "thermal"])} saving={saving} />}
        {tab === "printing" && <PrintingTab form={form} patch={patch} editable={editable} onSave={() => save(["thermal"])} saving={saving} />}
        {tab === "billing" && <BillingTab form={form} patch={patch} editable={editable} onSave={() => save(["cd", "prefixes"])} saving={saving} />}
        {tab === "notifications" && <NotificationsTab form={form} patch={patch} editable={editable} onSave={() => save(["notifications"])} saving={saving} />}
        {tab === "permissions" && <PermissionsTab form={form} setForm={setForm} groups={data.permissionGroups?.length ? data.permissionGroups : PERMISSION_CATALOG} editable={editable} onSave={() => save(["rolePermissions"])} saving={saving} />}
        {tab === "appearance" && <AppearanceTab form={form} patch={patch} editable={editable} onSave={() => save(["theme"])} saving={saving} />}
        {tab === "security" && <SecurityTab />}
      </div>
    </div>

    <Modal open={blocker.state === "blocked"} onClose={() => blocker.reset?.()} size="sm"
      title="Unsaved changes" subtitle={`You have unsaved edits in ${changedKeys.length} section${changedKeys.length === 1 ? "" : "s"}.`}
      footer={<>
        <Button variant="ghost" onClick={() => blocker.reset?.()}>Keep editing</Button>
        <Button variant="danger" onClick={() => blocker.proceed?.()}>Discard &amp; leave</Button>
        <Button variant="primary" icon={FiCheckCircle} disabled={saving} onClick={saveAndLeave}>{saving ? "Saving…" : "Save & leave"}</Button>
      </>}>
      <div className="flex items-start gap-3">
        <span className="grid place-items-center size-10 rounded-xl bg-warning/15 text-warning shrink-0"><FiAlertTriangle /></span>
        <p className="text-sm text-ink-2">Do you want to save your changes before leaving Settings? Unsaved changes will be lost if you discard.</p>
      </div>
    </Modal>
    </>
  );
}

function TabCard({ title, subtitle, icon: Icon, children, onSave, saving, editable, footer }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          {Icon && <span className="grid place-items-center size-9 rounded-xl bg-surface-3 text-brand shrink-0"><Icon /></span>}
          <div><h3 className="font-semibold text-ink">{title}</h3>{subtitle && <p className="text-xs text-muted mt-0.5">{subtitle}</p>}</div>
        </div>
        {onSave && editable && <Button variant="primary" size="sm" icon={FiCheckCircle} onClick={onSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}
      </div>
      <fieldset disabled={!editable} className={cx(!editable && "opacity-70 pointer-events-none")}>{children}</fieldset>
      {footer}
    </Card>
  );
}

const Text = ({ label, value, onChange, ...rest }) => <Field label={label}><input className="input" value={value ?? ""} onChange={(e) => onChange(e.target.value)} {...rest} /></Field>;

function BusinessTab({ form, patch, editable, onSave, saving }) {
  const b = form.business || {};
  const set = (k, v) => patch("business", { ...b, [k]: v });
  return (
    <TabCard title="Business profile" subtitle="Shown on every invoice & receipt" icon={FiHome} onSave={onSave} saving={saving} editable={editable}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Text label="Business name" value={b.name} onChange={(v) => set("name", v)} />
        <Text label="Tagline" value={b.tagline} onChange={(v) => set("tagline", v)} />
        <Text label="Owner name" value={b.owner} onChange={(v) => set("owner", v)} />
        <Text label="GST number" value={b.gstin} onChange={(v) => set("gstin", v)} />
        <Text label="Phone" value={b.contact} onChange={(v) => set("contact", v)} />
        <Text label="Email" value={b.email} onChange={(v) => set("email", v)} />
        <Text label="Website" value={b.website} onChange={(v) => set("website", v)} />
        <Text label="City / state" value={b.city} onChange={(v) => set("city", v)} />
        <Field label="Address (one line per row)" wide><textarea className="input h-24 py-2" value={(b.addressLines || []).join("\n")} onChange={(e) => set("addressLines", e.target.value.split("\n"))} /></Field>
      </div>
    </TabCard>
  );
}

function BankTab({ form, patch, editable, onSave, saving }) {
  const bank = form.bank || {};
  const set = (k, v) => patch("bank", { ...bank, [k]: v });
  const [genQr, setGenQr] = useState("");
  const hasUpi = !!(bank.upi || "").trim();
  useEffect(() => { let ok = true; makeQr(upiUri(form, null)).then((d) => ok && setGenQr(d)); return () => { ok = false; }; }, [form]);

  return (
    <TabCard title="Bank & UPI" subtitle="Payment details and QR shown to parties" icon={FiCreditCard} onSave={onSave} saving={saving} editable={editable}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Text label="Bank name" value={bank.name} onChange={(v) => set("name", v)} />
        <Text label="Account number" value={bank.account} onChange={(v) => set("account", v)} />
        <Text label="IFSC" value={bank.ifsc} onChange={(v) => set("ifsc", v)} />
        <Text label="Branch" value={bank.branch} onChange={(v) => set("branch", v)} />
        <Text label="UPI ID" value={bank.upi} onChange={(v) => set("upi", v)} placeholder="name@bank" />
        <Text label="Payee name (UPI)" value={bank.upiName} onChange={(v) => set("upiName", v)} placeholder="Account holder name" />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-line p-4">
        <div className="text-center">
          <img src={genQr} alt="Payment QR" className="size-28 rounded-lg border border-line bg-white object-contain" />
          <p className="text-[11px] text-muted mt-1">{hasUpi ? "Live preview" : "Set a UPI ID"}</p>
        </div>
        <div className="space-y-1">
          <p className="text-sm text-ink-2 max-w-sm">The payment QR is generated automatically from your <b>UPI ID</b>. When a customer scans it, their UPI app opens paying <b>you</b>, with that bill's due amount already filled in. Change the UPI ID above anytime — every bill updates instantly.</p>
          {!hasUpi && <p className="text-xs text-warn">Enter your UPI ID to activate scan-to-pay QR codes on bills.</p>}
        </div>
      </div>
    </TabCard>
  );
}

function InvoiceTab({ form, patch, editable, onSave, saving }) {
  const inv = form.invoice || {};
  const set = (k, v) => patch("invoice", { ...inv, [k]: v });
  const qrTypes = inv.qrTypes || {};
  const setQrType = (k, v) => set("qrTypes", { ...qrTypes, [k]: v });
  const qrOn = inv.showQr !== false;
  return (
    <TabCard title="Invoice content" subtitle="Footer, terms, signature & logo" icon={FiFileText} onSave={onSave} saving={saving} editable={editable}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Text label="Logo text (initials)" value={inv.logoText} onChange={(v) => set("logoText", v)} maxLength={3} />
        <Text label="Signature label" value={inv.signatureName} onChange={(v) => set("signatureName", v)} />
        <Field label="Invoice footer" wide><input className="input" value={inv.footer ?? ""} onChange={(e) => set("footer", e.target.value)} /></Field>
        <Field label="Terms & conditions" wide><textarea className="input h-20 py-2" value={inv.terms ?? ""} onChange={(e) => set("terms", e.target.value)} /></Field>
      </div>
      <div className="mt-4 rounded-xl border border-line p-4 space-y-3">
        <Toggle label="Show payment QR on bills" hint="Master switch — turn off to hide the scan-to-pay QR on every bill" checked={qrOn} onChange={(v) => set("showQr", v)} disabled={!editable} />
        {qrOn && (
          <div className="ml-1 pl-4 border-l-2 border-line space-y-2.5">
            <p className="text-xs text-muted">Choose which bill types show the QR. It also hides automatically once a bill is fully paid.</p>
            <Toggle label="Sale invoices" checked={qrTypes.sale !== false} onChange={(v) => setQrType("sale", v)} disabled={!editable} />
            <Toggle label="Truck sale documents" hint="Bill of Supply & Challan" checked={qrTypes.truckSale !== false} onChange={(v) => setQrType("truckSale", v)} disabled={!editable} />
            <Toggle label="Purchase vouchers" hint="Usually off — you're the one paying the supplier" checked={qrTypes.purchase === true} onChange={(v) => setQrType("purchase", v)} disabled={!editable} />
          </div>
        )}
      </div>
    </TabCard>
  );
}

// Per-document print control: which elements appear on each document, per-document terms/footer
// text, and the composer defaults (payment method + thermal width). Mirrors server/settings.js
// `documents` + `billing`. `APPLIES` marks which elements each document can actually render, so
// the matrix never shows a toggle that would do nothing (e.g. a thermal receipt has no terms line).
const DOC_COLS = [
  { key: "a4", label: "A4 Invoice" },
  { key: "thermal", label: "Thermal" },
  { key: "gst", label: "Bill of Supply" },
  { key: "challan", label: "Challan" },
];
const DOC_ELEMENTS = [
  { key: "qr", label: "Payment QR" },
  { key: "signature", label: "Signature" },
  { key: "stamp", label: "Payment stamp" },
  { key: "terms", label: "Terms" },
  { key: "bank", label: "Bank block" },
  { key: "remarks", label: "Remarks" },
];
const APPLIES = {
  a4:      { qr: 1, signature: 1, stamp: 1, terms: 1, bank: 1, remarks: 1 },
  thermal: { qr: 1, signature: 1, stamp: 1, terms: 0, bank: 0, remarks: 1 },
  gst:     { qr: 1, signature: 1, stamp: 1, terms: 1, bank: 1, remarks: 1 },
  challan: { qr: 1, signature: 1, stamp: 1, terms: 1, bank: 0, remarks: 1 },
};
const DOC_TEXT_FIELDS = { a4: ["terms", "footer"], thermal: ["footer"], gst: ["terms"], challan: ["terms"] };

function DocumentsTab({ form, patch, editable, onSave, saving }) {
  const docs = form.documents || {};
  const billing = form.billing || {};
  const th = form.thermal || {};
  const setCol = (col, key, v) => patch("documents", { ...docs, [col]: { ...(docs[col] || {}), [key]: v } });
  const isOn = (col, el) => { const d = docs[col]; return !d || d[el] === undefined ? true : d[el] !== false; };
  return (
    <TabCard title="Documents" subtitle="Control exactly what prints on each document type" icon={FiLayers} onSave={onSave} saving={saving} editable={editable}>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[540px] border-collapse">
          <thead>
            <tr>
              <th className="text-left text-xs font-semibold text-muted pb-2 pr-3">Element</th>
              {DOC_COLS.map((c) => <th key={c.key} className="text-center text-xs font-semibold text-ink-2 pb-2 px-2">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {DOC_ELEMENTS.map((el) => (
              <tr key={el.key} className="border-t border-line">
                <td className="text-sm text-ink py-2 pr-3">{el.label}</td>
                {DOC_COLS.map((c) => (
                  <td key={c.key} className="py-2 px-2">
                    {APPLIES[c.key][el.key]
                      ? <div className="flex justify-center"><Toggle checked={isOn(c.key, el.key)} onChange={(v) => setCol(c.key, el.key, v)} disabled={!editable} /></div>
                      : <div className="text-center text-xs text-muted">—</div>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted mt-2">The Challan defaults to no QR and no payment stamp — it carries no money. The QR also hides automatically once a bill is fully paid.</p>

      <div className="mt-5 grid sm:grid-cols-2 gap-3">
        {DOC_COLS.map((c) => (
          <div key={c.key} className="rounded-xl border border-line p-3 space-y-2">
            <p className="text-sm font-semibold text-ink">{c.label}</p>
            {DOC_TEXT_FIELDS[c.key].includes("terms") && (
              <Field label="Terms text (blank = use Invoice tab)"><textarea className="input h-16 py-2" value={docs[c.key]?.termsText ?? ""} onChange={(e) => setCol(c.key, "termsText", e.target.value)} disabled={!editable} /></Field>
            )}
            {DOC_TEXT_FIELDS[c.key].includes("footer") && (
              <Field label="Footer text (blank = use Invoice tab)"><input className="input" value={docs[c.key]?.footerText ?? ""} onChange={(e) => setCol(c.key, "footerText", e.target.value)} disabled={!editable} /></Field>
            )}
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-line p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold text-ink mb-2">Default payment method</p>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button key={m} type="button" onClick={() => patch("billing", { ...billing, defaultPaymentMethod: m })} disabled={!editable}
                className={cx("btn btn-sm", (billing.defaultPaymentMethod || "Cash") === m ? "btn-primary" : "btn-ghost")}>{m}</button>
            ))}
          </div>
          <p className="text-xs text-muted mt-1.5">Preselected in the sale / purchase composer (truck sales still fall back to Credit when unset).</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-ink mb-2">Default thermal paper width</p>
          <div className="flex gap-2">
            {["58", "80"].map((w) => (
              <button key={w} type="button" onClick={() => patch("thermal", { ...th, width: w })} disabled={!editable} className={cx("btn btn-sm", th.width === w ? "btn-primary" : "btn-ghost")}>{w} mm</button>
            ))}
          </div>
        </div>
      </div>
    </TabCard>
  );
}

function PrintingTab({ form, patch, editable, onSave, saving }) {
  const th = form.thermal || {};
  return (
    <TabCard title="Printing" subtitle="Thermal paper width & receipt output" icon={FiPrinter} onSave={onSave} saving={saving} editable={editable}>
      <Field label="Default thermal paper width">
        <div className="flex gap-2">
          {["58", "80"].map((w) => (
            <button key={w} onClick={() => patch("thermal", { ...th, width: w })} className={cx("btn", th.width === w ? "btn-primary" : "btn-ghost")}>{w} mm</button>
          ))}
        </div>
      </Field>
      <p className="text-xs text-muted mt-3">Receipts are generated as 300 DPI images, so they print crisply on any thermal printer. The browser print dialog lets you pick the physical printer.</p>
    </TabCard>
  );
}

function BillingTab({ form, patch, editable, onSave, saving }) {
  const cd = form.cd || {};
  const pf = form.prefixes || {};
  return (
    <>
      <TabCard title="Billing & tax" subtitle="CD deduction rule and invoice numbering" icon={FiSliders} onSave={onSave} saving={saving} editable={editable}>
        <div className="rounded-xl border border-line p-4 mb-4">
          <Toggle label="Enable CD deduction rule" hint="Billers still choose to apply it per purchase bill" checked={cd.enabled !== false} onChange={(v) => patch("cd", { ...cd, enabled: v })} disabled={!editable} />
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <Text label="CD rate (%)" type="number" value={cd.rate} onChange={(v) => patch("cd", { ...cd, rate: Number(v) })} />
            <Text label="Applies above (₹)" type="number" value={cd.threshold} onChange={(v) => patch("cd", { ...cd, threshold: Number(v) })} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Text label="Sale bill prefix" value={pf.sale} onChange={(v) => patch("prefixes", { ...pf, sale: v })} />
          <Text label="Purchase bill prefix" value={pf.purchase} onChange={(v) => patch("prefixes", { ...pf, purchase: v })} />
        </div>
      </TabCard>
      <div className="mt-4"><TruckNumberingCard editable={editable} /></div>
    </>
  );
}

/** Configure / reset the auto-incrementing truck Bill-of-Supply + Challan numbers. */
function TruckNumberingCard({ editable }) {
  const { data, saveCounters } = useApp();
  const [form, setForm] = useState({ invoice: { prefix: "", next: 1 }, challan: { prefix: "", next: 1 } });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const s = data.serials || {};
    setForm({
      invoice: { prefix: s.invoice?.prefix || "", next: s.invoice?.next ?? 1 },
      challan: { prefix: s.challan?.prefix || "", next: s.challan?.next ?? 1 },
    });
  }, [data.serials]);
  const set = (doc, k, v) => setForm((f) => ({ ...f, [doc]: { ...f[doc], [k]: v } }));
  const save = async () => {
    setSaving(true);
    try {
      await saveCounters({
        invoice: { prefix: form.invoice.prefix, next: Math.max(1, Number(form.invoice.next) || 1) },
        challan: { prefix: form.challan.prefix, next: Math.max(1, Number(form.challan.next) || 1) },
      });
    } finally { setSaving(false); }
  };
  const rows = [["invoice", "Bill of Supply (Invoice)"], ["challan", "Challan"]];
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-start gap-3">
          <span className="grid place-items-center size-9 rounded-xl bg-surface-3 text-brand shrink-0"><FiHash /></span>
          <div><h3 className="font-semibold text-ink">Truck document numbering</h3><p className="text-xs text-muted mt-0.5">Auto-increments on each truck sale · set a prefix or reset the next number</p></div>
        </div>
        {editable && <Button variant="primary" size="sm" icon={FiCheckCircle} onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>}
      </div>
      <fieldset disabled={!editable} className={cx(!editable && "opacity-70 pointer-events-none", "space-y-3")}>
        {rows.map(([doc, label]) => (
          <div key={doc} className="grid sm:grid-cols-[1fr_9rem_9rem] gap-3 items-end">
            <p className="text-sm font-medium text-ink pb-2.5">{label}</p>
            <Field label="Prefix"><input className="input" value={form[doc].prefix} onChange={(e) => set(doc, "prefix", e.target.value)} placeholder="e.g. INV-" /></Field>
            <Field label="Next number"><input className="input" type="number" min="1" value={form[doc].next} onChange={(e) => set(doc, "next", e.target.value)} /></Field>
          </div>
        ))}
      </fieldset>
      <p className="text-xs text-muted mt-3">Next truck sale will use <b>{(form.invoice.prefix || "") + (form.invoice.next || 1)}</b> (invoice) and <b>{(form.challan.prefix || "") + (form.challan.next || 1)}</b> (challan).</p>
    </Card>
  );
}

function NotificationsTab({ form, patch, editable, onSave, saving }) {
  const n = form.notifications || {};
  const owner = n.owner || {};
  const wa = n.whatsapp || {};
  const setOwner = (k, v) => patch("notifications", { ...n, owner: { ...owner, [k]: v } });
  const setWa = (k, v) => patch("notifications", { ...n, whatsapp: { ...wa, [k]: v } });
  const OWNER_OPTS = [
    ["saleBill", "Sale bill created"], ["purchaseBill", "Purchase bill created"], ["partyAdded", "Party added"], ["partyEdited", "Party edited"],
    ["productAdded", "Product added"], ["productUpdated", "Product updated"], ["rateChanges", "Rate changes"], ["inventoryAlerts", "Inventory alerts"],
    ["loginAlerts", "Login alerts"], ["failedLoginAlerts", "Failed login alerts"], ["backupAlerts", "Backup alerts"], ["lowStock", "Low stock"],
    ["dailySummary", "Daily summary"], ["weeklySummary", "Weekly summary"], ["monthlySummary", "Monthly summary"], ["profitReport", "Profit report"],
  ];
  return (
    <TabCard title="Notifications" subtitle="Owner WhatsApp alerts (provider-agnostic)" icon={FiBell} onSave={onSave} saving={saving} editable={editable}>
      <div className="rounded-xl border border-line p-4 mb-4">
        <Toggle label="Enable WhatsApp notifications" checked={wa.enabled === true} onChange={(v) => setWa("enabled", v)} disabled={!editable} />
        {wa.enabled && (
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <Field label="Provider"><select className="input" value={wa.provider || "meta"} onChange={(e) => setWa("provider", e.target.value)}>{["meta", "twilio", "360dialog", "custom"].map((p) => <option key={p} value={p}>{p}</option>)}</select></Field>
            <Text label="Owner WhatsApp number" value={wa.ownerNumber} onChange={(v) => setWa("ownerNumber", v)} />
            <Text label="API URL" value={wa.apiUrl} onChange={(v) => setWa("apiUrl", v)} />
            <Text label="Phone number ID" value={wa.phoneNumberId} onChange={(v) => setWa("phoneNumberId", v)} />
            <Text label="API token" type="password" value={wa.token} onChange={(v) => setWa("token", v)} />
            <Text label="Group ID (bills broadcast)" value={wa.groupId} onChange={(v) => setWa("groupId", v)} />
          </div>
        )}
      </div>
      <p className="text-sm font-semibold text-ink mb-1">Owner alerts</p>
      <div className="grid sm:grid-cols-2 gap-x-6">
        {OWNER_OPTS.map(([k, label]) => <Toggle key={k} label={label} checked={owner[k] === true} onChange={(v) => setOwner(k, v)} disabled={!editable} />)}
      </div>
    </TabCard>
  );
}

const ROLES = [
  { id: "admin", label: "Administrator", hint: "Full control of the mill" },
  { id: "manager", label: "Manager", hint: "Operations without user admin" },
  { id: "biller", label: "Biller", hint: "Front-desk billing" },
];

function PermissionsTab({ form, setForm, groups, editable, onSave, saving }) {
  const [role, setRole] = useState("manager");
  const rp = form.rolePermissions || {};
  const allKeys = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.key)), [groups]);
  const lockedKeys = role === "admin" ? ADMIN_LOCKED_PERMISSIONS : [];
  const isLocked = (key) => lockedKeys.includes(key);

  const current = rp[role];
  const granted = useMemo(
    () => new Set(Array.isArray(current) ? current : defaultRolePermissions(role, allKeys)),
    [current, role, allKeys],
  );

  const commit = (nextSet) => {
    // Locked keys are always granted for admins so a tenant can never lock itself out.
    lockedKeys.forEach((k) => nextSet.add(k));
    setForm((f) => ({ ...f, rolePermissions: { ...(f.rolePermissions || {}), [role]: [...nextSet] } }));
  };
  const toggle = (key) => {
    if (!editable || isLocked(key)) return;
    const next = new Set(granted); next.has(key) ? next.delete(key) : next.add(key); commit(next);
  };
  const grantAll = () => commit(new Set(allKeys));
  const revokeAll = () => commit(new Set(lockedKeys));
  const setGroup = (items, on) => {
    const next = new Set(granted);
    items.forEach((it) => { if (isLocked(it.key)) return; on ? next.add(it.key) : next.delete(it.key); });
    commit(next);
  };

  const grantedCount = allKeys.filter((k) => granted.has(k)).length;

  return (
    <TabCard title="Roles & access" subtitle="Enable, disable and fine-tune every page, feature and action per role" icon={FiShield} onSave={onSave} saving={saving} editable={editable}>
      {/* Role picker — clear cards so it reads as role management, not a flat list. */}
      <div className="grid sm:grid-cols-3 gap-2 mb-4">
        {ROLES.map((r) => (
          <button key={r.id} type="button" onClick={() => setRole(r.id)}
            className={cx("text-left p-3 rounded-xl border transition-all", role === r.id ? "border-brand bg-brand/8" : "border-line hover:bg-surface-2")}>
            <span className={cx("block text-sm font-semibold capitalize", role === r.id ? "text-brand" : "text-ink")}>{r.label}</span>
            <span className="block text-xs text-muted mt-0.5">{r.hint}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Badge tone="info">{grantedCount} / {allKeys.length} permissions</Badge>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" size="sm" icon={FiCheckCircle} onClick={grantAll} disabled={!editable}>Enable all</Button>
          <Button variant="ghost" size="sm" icon={FiLock} onClick={revokeAll} disabled={!editable}>Disable all</Button>
        </div>
      </div>

      {role === "admin" && <p className="text-xs text-warning mb-3 flex items-center gap-1.5"><FiShield /> Administrators always retain settings &amp; user management (safety lock — those switches stay on).</p>}

      <div className="space-y-4">
        {groups.map((g) => {
          const on = g.items.filter((it) => granted.has(it.key)).length;
          const allOn = on === g.items.length;
          return (
            <div key={g.group} className="rounded-xl border border-line p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold uppercase tracking-wide text-muted">{g.group} <span className="text-muted/70">({on}/{g.items.length})</span></p>
                <button type="button" onClick={() => setGroup(g.items, !allOn)} disabled={!editable}
                  className="text-xs font-semibold text-brand hover:underline disabled:opacity-40 disabled:no-underline">
                  {allOn ? "Clear group" : "Select group"}
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6">
                {g.items.map((it) => (
                  <Toggle key={it.key} label={it.label} hint={isLocked(it.key) ? "Locked for admin" : undefined}
                    checked={granted.has(it.key)} onChange={() => toggle(it.key)} disabled={!editable || isLocked(it.key)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-muted mt-4">Changes take effect the next time each affected user signs in. Your own administrator access is never removed.</p>
    </TabCard>
  );
}

function AppearanceTab({ form, patch, editable, onSave, saving }) {
  const { theme, setTheme } = useApp();
  const t = form.theme || {};
  return (
    <TabCard title="Appearance" subtitle="Theme & contextual bill colours" icon={FiMonitor} onSave={onSave} saving={saving} editable={editable}>
      <p className="field-label">Theme</p>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[{ v: "light", i: FiSun, l: "Light" }, { v: "system", i: FiMonitor, l: "System" }, { v: "dark", i: FiMoon, l: "Dark" }].map(({ v, i: Icon, l }) => (
          <button key={v} onClick={() => setTheme(v)} className={cx("flex flex-col items-center gap-2 p-4 rounded-xl border transition-all", theme === v ? "border-brand bg-brand/8 text-brand" : "border-line text-ink-2 hover:bg-surface-2")}>
            <Icon className="text-xl" /><span className="text-sm font-medium">{l}</span>
          </button>
        ))}
      </div>
      <Toggle label="Contextual bill colours" hint="Rose for sale, amber for purchase — instant visual cue" checked={t.contextualBillThemes !== false} onChange={(v) => patch("theme", { ...t, contextualBillThemes: v })} disabled={!editable} />
    </TabCard>
  );
}

function SecurityTab() {
  const { user, toast } = useApp();
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw.next !== pw.confirm) return toast("New passwords do not match", "danger");
    setBusy(true);
    try { await api.changePassword(pw.next); toast("Password changed — sign in again", "success"); setTimeout(() => window.location.reload(), 1200); }
    catch (e2) { toast(e2.message, "danger"); setBusy(false); }
  };
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <Avatar name={user.displayName} className="size-12 text-base" />
        <div><p className="font-semibold text-ink">{user.displayName}</p><p className="text-sm text-muted">{user.username}</p><Badge className="capitalize mt-1">{user.role}{user.branch ? ` · ${user.branch}` : ""}</Badge></div>
      </div>
      <form onSubmit={submit} className="space-y-3 max-w-sm">
        <p className="text-sm font-semibold text-ink flex items-center gap-2"><FiLock /> Change password</p>
        <Field label="New password" hint="10+ chars with upper, lower, number & symbol"><input type="password" className="input" value={pw.next} onChange={(e) => setPw((c) => ({ ...c, next: e.target.value }))} /></Field>
        <Field label="Confirm new password"><input type="password" className="input" value={pw.confirm} onChange={(e) => setPw((c) => ({ ...c, confirm: e.target.value }))} /></Field>
        <Button variant="primary" icon={FiCheckCircle} disabled={busy || !pw.next}>{busy ? "Saving…" : "Update password"}</Button>
      </form>
    </Card>
  );
}
