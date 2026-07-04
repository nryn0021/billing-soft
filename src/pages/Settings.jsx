import { useEffect, useMemo, useState } from "react";
import {
  FiBell, FiCheckCircle, FiCreditCard, FiHome, FiKey, FiLock, FiMonitor, FiMoon,
  FiPrinter, FiShield, FiSliders, FiSun, FiTrash2, FiUpload, FiFileText,
} from "react-icons/fi";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { Avatar, Badge, Button, Card, Field, Toggle, cx } from "../ui";
import { makeQr, upiUri } from "../lib/qr";

const TABS = [
  { id: "business", label: "Business", icon: FiHome },
  { id: "bank", label: "Bank & UPI", icon: FiCreditCard },
  { id: "invoice", label: "Invoice", icon: FiFileText },
  { id: "printing", label: "Printing", icon: FiPrinter },
  { id: "billing", label: "Billing & tax", icon: FiSliders },
  { id: "notifications", label: "Notifications", icon: FiBell },
  { id: "permissions", label: "Permissions", icon: FiShield },
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

  return (
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
        {tab === "bank" && <BankTab form={form} patch={patch} setForm={setForm} editable={editable} onSave={() => save(["bank", "qrImage"])} saving={saving} />}
        {tab === "invoice" && <InvoiceTab form={form} patch={patch} editable={editable} onSave={() => save(["invoice"])} saving={saving} />}
        {tab === "printing" && <PrintingTab form={form} patch={patch} editable={editable} onSave={() => save(["thermal"])} saving={saving} />}
        {tab === "billing" && <BillingTab form={form} patch={patch} editable={editable} onSave={() => save(["cd", "prefixes"])} saving={saving} />}
        {tab === "notifications" && <NotificationsTab form={form} patch={patch} editable={editable} onSave={() => save(["notifications"])} saving={saving} />}
        {tab === "permissions" && <PermissionsTab form={form} setForm={setForm} groups={data.permissionGroups || []} editable={editable} onSave={() => save(["rolePermissions"])} saving={saving} />}
        {tab === "appearance" && <AppearanceTab form={form} patch={patch} editable={editable} onSave={() => save(["theme"])} saving={saving} />}
        {tab === "security" && <SecurityTab />}
      </div>
    </div>
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

function BankTab({ form, patch, setForm, editable, onSave, saving }) {
  const bank = form.bank || {};
  const set = (k, v) => patch("bank", { ...bank, [k]: v });
  const [genQr, setGenQr] = useState("");
  useEffect(() => { let ok = true; makeQr(upiUri(form, null)).then((d) => ok && setGenQr(d)); return () => { ok = false; }; }, [form]);

  const onUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) { alert("Please upload an image under 400 KB."); return; }
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, qrImage: reader.result }));
    reader.readAsDataURL(file);
  };

  return (
    <TabCard title="Bank & UPI" subtitle="Payment details and QR shown to parties" icon={FiCreditCard} onSave={onSave} saving={saving} editable={editable}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Text label="Bank name" value={bank.name} onChange={(v) => set("name", v)} />
        <Text label="Account number" value={bank.account} onChange={(v) => set("account", v)} />
        <Text label="IFSC" value={bank.ifsc} onChange={(v) => set("ifsc", v)} />
        <Text label="Branch" value={bank.branch} onChange={(v) => set("branch", v)} />
        <Text label="UPI ID" value={bank.upi} onChange={(v) => set("upi", v)} />
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-line p-4">
        <div className="text-center">
          <img src={form.qrImage || genQr} alt="Payment QR" className="size-28 rounded-lg border border-line bg-white object-contain" />
          <p className="text-[11px] text-muted mt-1">{form.qrImage ? "Uploaded QR" : "Generated from UPI"}</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm text-ink-2 max-w-sm">Upload your own payment QR image, or leave blank to auto-generate one from your UPI id. Every invoice updates instantly.</p>
          <div className="flex gap-2">
            <label className="btn btn-ghost btn-sm cursor-pointer"><FiUpload /> Upload QR<input type="file" accept="image/*" className="hidden" onChange={onUpload} disabled={!editable} /></label>
            {form.qrImage && <Button variant="danger" size="sm" icon={FiTrash2} onClick={() => setForm((f) => ({ ...f, qrImage: "" }))}>Remove</Button>}
          </div>
        </div>
      </div>
    </TabCard>
  );
}

function InvoiceTab({ form, patch, editable, onSave, saving }) {
  const inv = form.invoice || {};
  const set = (k, v) => patch("invoice", { ...inv, [k]: v });
  return (
    <TabCard title="Invoice content" subtitle="Footer, terms, signature & logo" icon={FiFileText} onSave={onSave} saving={saving} editable={editable}>
      <div className="grid sm:grid-cols-2 gap-3">
        <Text label="Logo text (initials)" value={inv.logoText} onChange={(v) => set("logoText", v)} maxLength={3} />
        <Text label="Signature label" value={inv.signatureName} onChange={(v) => set("signatureName", v)} />
        <Field label="Invoice footer" wide><input className="input" value={inv.footer ?? ""} onChange={(e) => set("footer", e.target.value)} /></Field>
        <Field label="Terms & conditions" wide><textarea className="input h-20 py-2" value={inv.terms ?? ""} onChange={(e) => set("terms", e.target.value)} /></Field>
      </div>
      <div className="mt-3"><Toggle label="Show payment QR on invoices" checked={inv.showQr !== false} onChange={(v) => set("showQr", v)} disabled={!editable} /></div>
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

function PermissionsTab({ form, setForm, groups, editable, onSave, saving }) {
  const [role, setRole] = useState("manager");
  const rp = form.rolePermissions || {};
  const allKeys = useMemo(() => groups.flatMap((g) => g.items.map((i) => i.key)), [groups]);
  const current = rp[role];
  const granted = new Set(Array.isArray(current) ? current : defaultsFor(role, allKeys));
  const toggle = (key) => {
    const next = new Set(granted); next.has(key) ? next.delete(key) : next.add(key);
    setForm((f) => ({ ...f, rolePermissions: { ...(f.rolePermissions || {}), [role]: [...next] } }));
  };
  return (
    <TabCard title="Roles & permissions" subtitle="Feature, page and button-level access per role" icon={FiShield} onSave={onSave} saving={saving} editable={editable}>
      <div className="flex gap-2 mb-4">
        {["admin", "manager", "biller"].map((r) => (
          <button key={r} onClick={() => setRole(r)} className={cx("btn btn-sm capitalize", role === r ? "btn-primary" : "btn-ghost")}>{r}</button>
        ))}
      </div>
      {role === "admin" && <p className="text-xs text-warning mb-3">Admins always retain full settings & user management (safety lock).</p>}
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.group}>
            <p className="text-xs font-bold uppercase tracking-wide text-muted mb-1.5">{g.group}</p>
            <div className="grid sm:grid-cols-2 gap-x-6">
              {g.items.map((it) => <Toggle key={it.key} label={it.label} checked={granted.has(it.key)} onChange={() => toggle(it.key)} disabled={!editable} />)}
            </div>
          </div>
        ))}
      </div>
    </TabCard>
  );
}
function defaultsFor(role, all) {
  if (role === "admin") return all;
  if (role === "manager") return all.filter((k) => !k.startsWith("users.") && k !== "settings.manage" && k !== "bills.create" && k !== "backup.manage");
  return ["dashboard.view", "bills.view", "bills.create", "bills.print", "parties.view", "parties.create", "parties.edit", "inventory.view"];
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
