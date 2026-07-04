import { useEffect, useMemo, useState } from "react";
import { useOutletContext } from "react-router-dom";
import {
  FiArrowDownLeft, FiBox, FiDownload, FiMaximize, FiPackage, FiRepeat,
  FiSearch, FiSliders, FiTrendingUp,
} from "react-icons/fi";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { Badge, BarList, Button, Card, EmptyState, Field, Modal, PanelHeader, ProgressBar, Segmented, SkeletonRows, cx } from "../ui";
import { exportCsv } from "../lib/export";
import { makeBarcode, downloadDataUrl } from "../lib/barcode";
import { SERIES_COLORS, formatDateTime, inr, inr2, num } from "../lib/format";
import { LOW_STOCK_KG, inventoryValuation, productBreakdown } from "../lib/reports";
import { useDebounced } from "../lib/hooks";

export default function Inventory() {
  const { data, setData, can, toast } = useApp();
  const { openBill, branch } = useOutletContext();
  const [query, setQuery] = useState("");
  const [view, setView] = useState("stock");
  const [modal, setModal] = useState(null); // { kind: 'adjust'|'transfer'|'barcode', product? }
  const q = useDebounced(query);

  const inv = inventoryValuation(data.products);
  const maxStock = Math.max(...data.products.map((p) => p.stockKg), 1);
  const transactions = branch === "All branches" ? data.transactions : data.transactions.filter((t) => t.branch === branch);
  const movement = useMemo(() => productBreakdown(transactions, "sale").slice(0, 6).map((p, i) => ({ id: p.id, label: p.name, value: p.weight, color: SERIES_COLORS[i] })), [transactions]);
  const products = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.products.filter((p) => !term || p.name.toLowerCase().includes(term) || p.category.toLowerCase().includes(term));
  }, [data.products, q]);

  return (
    <div className="space-y-4 max-w-[1500px] mx-auto">
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-4 flex items-center gap-3"><span className="grid place-items-center size-11 rounded-xl bg-brand/12 text-brand"><FiPackage /></span><div><p className="text-xs text-muted">Total physical stock</p><p className="text-lg font-bold text-ink tnum">{num.format(inv.totalKg / 1000)} T</p></div></Card>
        <Card className="p-4 flex items-center gap-3"><span className="grid place-items-center size-11 rounded-xl bg-info/12 text-info"><FiBox /></span><div><p className="text-xs text-muted">Estimated stock value</p><p className="text-lg font-bold text-ink tnum">{inr.format(inv.value)}</p></div></Card>
        <Card className="p-4 flex items-center gap-3"><span className="grid place-items-center size-11 rounded-xl bg-accent/15 text-accent"><FiTrendingUp /></span><div><p className="text-xs text-muted">Product lines</p><p className="text-lg font-bold text-ink tnum">{data.products.length}</p></div></Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented options={[{ value: "stock", label: "Stock" }, { value: "movements", label: "Movement history" }]} value={view} onChange={setView} />
        {view === "stock" && (
          <div className="relative grow min-w-[180px] max-w-sm">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search grain or category…" className="input pl-9" />
          </div>
        )}
        <div className="flex gap-2 ml-auto">
          {can("inventory.export") && <Button variant="ghost" size="sm" icon={FiDownload} onClick={() => exportCsv(`inventory-${Date.now()}`, inv.lines, [{ key: "id", label: "ID" }, { key: "name", label: "Name" }, { key: "category", label: "Category" }, { key: "stockKg", label: "Stock (kg)" }, { key: "baseRate", label: "Base rate" }, { key: "value", label: "Value" }])}>Export</Button>}
          {can("inventory.transfer") && <Button variant="ghost" size="sm" icon={FiRepeat} onClick={() => setModal({ kind: "transfer" })}>Transfer</Button>}
          {can("inventory.adjust") && <Button variant="ghost" size="sm" icon={FiSliders} onClick={() => setModal({ kind: "adjust" })}>Adjust</Button>}
          <Button variant="primary" size="sm" icon={FiArrowDownLeft} onClick={() => openBill("purchase")}>Stock in</Button>
        </div>
      </div>

      {view === "stock" ? (
        <div className="grid xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2">
            {products.length === 0 ? <Card><EmptyState icon={FiPackage} title="No products found" /></Card> : (
              <div className="grid sm:grid-cols-2 gap-3">
                {products.map((p, i) => {
                  const low = p.stockKg < LOW_STOCK_KG;
                  return (
                    <Card key={p.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <span className="grid place-items-center size-11 rounded-xl text-white font-bold text-xs" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}>{p.short}</span>
                        <Badge tone={low ? "warning" : "success"}>{low ? "Low stock" : "In stock"}</Badge>
                      </div>
                      <h3 className="font-semibold text-ink mt-3">{p.name}</h3>
                      {p.hindiName && <p className="text-sm text-muted">{p.hindiName}</p>}
                      <p className="text-xs text-muted">{p.category} · {p.id}</p>
                      <div className="flex items-end justify-between mt-3">
                        <div><p className="text-xl font-bold text-ink tnum">{num.format(p.stockKg / 1000)} <span className="text-sm font-medium text-muted">T</span></p><p className="text-xs text-muted">{num.format(p.stockKg)} kg</p></div>
                        <p className="text-sm text-ink-2">@ {inr2.format(p.baseRate)}/kg</p>
                      </div>
                      <ProgressBar className="mt-3" value={p.stockKg} max={maxStock} color={low ? "var(--warning)" : SERIES_COLORS[i % SERIES_COLORS.length]} />
                      <div className="flex gap-2 mt-3">
                        <Button variant="ghost" size="sm" icon={FiMaximize} onClick={() => setModal({ kind: "barcode", product: p })}>Barcode</Button>
                        {can("inventory.adjust") && <Button variant="ghost" size="sm" icon={FiSliders} onClick={() => setModal({ kind: "adjust", product: p })}>Adjust</Button>}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
          <div className="space-y-4">
            <Card className="p-5"><PanelHeader title="Most sold (by weight)" subtitle={branch === "All branches" ? "All branches" : branch} />{movement.length ? <BarList data={movement} format={(v) => `${num.format(v)} kg`} /> : <EmptyState icon={FiTrendingUp} title="No movement yet" />}</Card>
            <Card className="p-5"><PanelHeader title="Valuation by product" subtitle="At current base rates" /><ul className="space-y-2 text-sm">{inv.lines.slice().sort((a, b) => b.value - a.value).map((p) => <li key={p.id} className="flex items-center justify-between"><span className="text-ink-2 truncate">{p.name}</span><span className="font-semibold text-ink tnum ml-2">{inr.format(p.value)}</span></li>)}</ul></Card>
          </div>
        </div>
      ) : <MovementsView />}

      {modal?.kind === "adjust" && <AdjustModal product={modal.product} products={data.products} branches={data.branches} onClose={() => setModal(null)} onDone={(d) => { setData(d); setModal(null); toast("Stock adjusted", "success"); }} />}
      {modal?.kind === "transfer" && <TransferModal product={modal.product} products={data.products} branches={data.branches} onClose={() => setModal(null)} onDone={(d) => { setData(d); setModal(null); toast("Transfer recorded", "success"); }} />}
      {modal?.kind === "barcode" && <BarcodeModal product={modal.product} onClose={() => setModal(null)} />}
    </div>
  );
}

function MovementsView() {
  const { toast } = useApp();
  const [rows, setRows] = useState(null);
  useEffect(() => { api.stockMovements().then((r) => setRows(r.movements)).catch((e) => toast(e.message, "danger")); }, [toast]);
  const TONE = { purchase: "success", sale: "warning", adjustment: "info", "transfer-in": "success", "transfer-out": "warning", opening: "info" };
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3.5 border-b border-line flex items-center justify-between"><p className="text-sm font-semibold text-ink">Stock movement history</p>{rows && <span className="text-xs text-muted">{rows.length} movements</span>}</div>
      {!rows ? <div className="p-5"><SkeletonRows rows={8} /></div> : rows.length === 0 ? <EmptyState icon={FiPackage} title="No movements yet" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead><tr className="text-left text-xs text-muted border-b border-line">{["When", "Product", "Type", "Change", "Balance", "Branch", "Note / bill", "By"].map((h) => <th key={h} className="font-medium px-4 py-2.5">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="row-hover border-b border-line">
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink-2">{formatDateTime(m.date)}</td>
                  <td className="px-4 py-2.5 text-ink">{m.product}</td>
                  <td className="px-4 py-2.5"><Badge tone={TONE[m.type]} className="capitalize">{m.type.replace("-", " ")}</Badge></td>
                  <td className={cx("px-4 py-2.5 tnum font-medium", m.quantityKg >= 0 ? "text-success" : "text-danger")}>{m.quantityKg >= 0 ? "+" : ""}{num.format(m.quantityKg)} kg</td>
                  <td className="px-4 py-2.5 tnum text-ink-2">{m.balanceKg == null ? "—" : `${num.format(m.balanceKg)} kg`}</td>
                  <td className="px-4 py-2.5 text-ink-2">{m.branch}</td>
                  <td className="px-4 py-2.5 text-muted">{m.note || m.bill || "—"}</td>
                  <td className="px-4 py-2.5 text-ink-2">{m.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AdjustModal({ product, products, branches, onClose, onDone }) {
  const [productId, setProductId] = useState(product?.id || products[0]?.id || "");
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  const [deltaKg, setDeltaKg] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setError(""); setSaving(true);
    try { const r = await api.adjustStock({ productId, branchId, deltaKg: Number(deltaKg), note }); onDone(r.data); }
    catch (e) { setError(e.message); setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Adjust stock" subtitle="Correct stock levels — recorded in the audit trail"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} disabled={saving || !deltaKg}>{saving ? "Saving…" : "Apply adjustment"}</Button></>}>
      <div className="space-y-3">
        {error && <div className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2.5">{error}</div>}
        <Field label="Product"><select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Branch"><select className="input" value={branchId} onChange={(e) => setBranchId(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Adjustment (kg)" hint="Use a negative value to reduce stock"><input className="input" type="number" step="0.01" value={deltaKg} onChange={(e) => setDeltaKg(e.target.value)} placeholder="e.g. -50 or 200" /></Field>
        <Field label="Reason / note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Damage, wastage, recount…" /></Field>
      </div>
    </Modal>
  );
}

function TransferModal({ product, products, branches, onClose, onDone }) {
  const [productId, setProductId] = useState(product?.id || products[0]?.id || "");
  const [fromBranchId, setFrom] = useState(branches[0]?.id || "");
  const [toBranchId, setTo] = useState(branches[1]?.id || branches[0]?.id || "");
  const [qtyKg, setQty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    setError(""); setSaving(true);
    try { const r = await api.transferStock({ productId, fromBranchId, toBranchId, qtyKg: Number(qtyKg), note }); onDone(r.data); }
    catch (e) { setError(e.message); setSaving(false); }
  };
  return (
    <Modal open onClose={onClose} size="sm" title="Transfer stock" subtitle="Move stock between branches"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} disabled={saving || !qtyKg}>{saving ? "Saving…" : "Record transfer"}</Button></>}>
      <div className="space-y-3">
        {error && <div className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2.5">{error}</div>}
        <Field label="Product"><select className="input" value={productId} onChange={(e) => setProductId(e.target.value)}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From branch"><select className="input" value={fromBranchId} onChange={(e) => setFrom(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="To branch"><select className="input" value={toBranchId} onChange={(e) => setTo(e.target.value)}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        </div>
        <Field label="Quantity (kg)"><input className="input" type="number" step="0.01" value={qtyKg} onChange={(e) => setQty(e.target.value)} placeholder="0.00" /></Field>
        <Field label="Note"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vehicle, reason…" /></Field>
      </div>
    </Modal>
  );
}

function BarcodeModal({ product, onClose }) {
  const [url, setUrl] = useState("");
  useEffect(() => { let ok = true; makeBarcode(product.id).then((d) => ok && setUrl(d)).catch(() => {}); return () => { ok = false; }; }, [product.id]);
  return (
    <Modal open onClose={onClose} size="sm" title={`Barcode · ${product.name}`} subtitle="Scan-ready product code (CODE128)"
      footer={<><Button variant="ghost" onClick={onClose}>Close</Button><Button variant="primary" icon={FiDownload} disabled={!url} onClick={() => downloadDataUrl(url, `barcode-${product.id}.png`)}>Download</Button></>}>
      <div className="grid place-items-center py-4 bg-white rounded-xl border border-line">
        {url ? <img src={url} alt={`Barcode ${product.id}`} /> : <div className="h-24 grid place-items-center text-muted text-sm">Generating…</div>}
      </div>
      <p className="text-xs text-muted mt-2 text-center">Print and attach to sacks. A USB scanner reading this code selects the grain in the bill composer.</p>
    </Modal>
  );
}
