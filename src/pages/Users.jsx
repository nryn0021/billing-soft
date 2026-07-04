import { useEffect, useState } from "react";
import { FiAlertTriangle, FiCheckCircle, FiCopy, FiKey, FiPower, FiShield, FiUserPlus } from "react-icons/fi";
import { api } from "../api";
import { useApp } from "../context/AppContext";
import { Avatar, Badge, Button, Card, Field, Modal, PanelHeader, cx } from "../ui";

const ROLES = [
  { value: "biller", label: "Biller — creates bills at one branch" },
  { value: "manager", label: "Manager — view + rate control" },
  { value: "admin", label: "Admin — full access" },
];

export default function Users() {
  const { data, user: me, can, toast } = useApp();
  const canManage = can("users.manage");
  const canReset = can("users.reset_password");
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState({ username: "", displayName: "", role: "biller", branchId: data.branches[0]?.id || "", password: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [resetResult, setResetResult] = useState(null); // { username, tempPassword }

  useEffect(() => { api.users().then((r) => setUsers(r.users)).catch((e) => setError(e.message)); }, []);
  const set = (k, v) => setForm((c) => ({ ...c, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setMessage(""); setSaving(true);
    try {
      const r = await api.createUser(form);
      setUsers(r.users);
      setMessage(`User "${form.username}" created. Share the temporary password privately.`);
      setForm({ username: "", displayName: "", role: "biller", branchId: data.branches[0]?.id || "", password: "" });
    } catch (e2) { setError(e2.message); } finally { setSaving(false); }
  };

  const resetPassword = async (u) => {
    try { const r = await api.resetUserPassword(u.id); setResetResult(r); }
    catch (e) { toast(e.message, "danger"); }
  };
  const toggleActive = async (u) => {
    try { const r = await api.setUserActive(u.id, !u.active); setUsers(r.users); toast(`${u.username} ${u.active ? "deactivated" : "activated"}`, "success"); }
    catch (e) { toast(e.message, "danger"); }
  };

  return (
    <div className={cx("grid gap-4 max-w-[1400px] mx-auto", canManage ? "lg:grid-cols-[22rem_1fr]" : "grid-cols-1")}>
      {canManage && (
        <Card className="p-5 h-fit">
          <PanelHeader title="Create a login" subtitle="Passwords are stored as salted scrypt hashes" icon={FiShield} />
          <form onSubmit={submit} className="space-y-3">
            {error && <div className="flex items-center gap-2 text-sm text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2.5"><FiAlertTriangle />{error}</div>}
            {message && <div className="flex items-start gap-2 text-sm text-success bg-success/10 border border-success/25 rounded-xl px-3 py-2.5"><FiCheckCircle className="mt-0.5 shrink-0" />{message}</div>}
            <Field label="Username"><input value={form.username} onChange={(e) => set("username", e.target.value)} placeholder="amarpur.biller2" className="input" /></Field>
            <Field label="Display name"><input value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="Full name" className="input" /></Field>
            <Field label="Role"><select value={form.role} onChange={(e) => set("role", e.target.value)} className="input">{ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field>
            <Field label="Branch" hint={form.role !== "biller" ? "Only billers are tied to a branch" : undefined}>
              <select value={form.branchId} onChange={(e) => set("branchId", e.target.value)} disabled={form.role !== "biller"} className="input">{data.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
            </Field>
            <Field label="Temporary password" hint="10+ chars, upper, lower, number & symbol"><input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder="Set a strong temporary password" className="input" /></Field>
            <Button variant="primary" icon={FiUserPlus} className="w-full" disabled={saving}>{saving ? "Creating…" : "Create user"}</Button>
          </form>
        </Card>
      )}

      <Card className="p-5">
        <PanelHeader title="Team members" subtitle={users ? `${users.length} login${users.length !== 1 ? "s" : ""}` : "Loading…"} />
        <div className="grid sm:grid-cols-2 gap-3">
          {(users || []).map((u) => (
            <div key={u.id} className="rounded-xl border border-line p-3">
              <div className="flex items-center gap-3">
                <Avatar name={u.displayName} className="size-10" />
                <div className="min-w-0 grow">
                  <p className="font-medium text-ink truncate">{u.displayName}</p>
                  <p className="text-xs text-muted">{u.username} · <span className="capitalize">{u.role}</span>{u.branch ? ` · ${u.branch}` : ""}</p>
                </div>
                <Badge tone={u.active ? "success" : "danger"}>{u.active ? "Active" : "Off"}</Badge>
              </div>
              {u.mustChangePassword && <p className="text-[11px] text-warning mt-1.5">Must change password on next sign in</p>}
              {(canReset || canManage) && u.id !== me.id && (
                <div className="flex gap-2 mt-2.5 pt-2.5 border-t border-line">
                  {canReset && <Button variant="ghost" size="sm" icon={FiKey} onClick={() => resetPassword(u)}>Reset password</Button>}
                  {canManage && <Button variant={u.active ? "danger" : "ghost"} size="sm" icon={FiPower} onClick={() => toggleActive(u)}>{u.active ? "Deactivate" : "Activate"}</Button>}
                </div>
              )}
            </div>
          ))}
          {users && users.length === 0 && <p className="text-sm text-muted">No users yet.</p>}
        </div>
      </Card>

      <Modal open={Boolean(resetResult)} onClose={() => setResetResult(null)} size="sm" title="Temporary password"
        subtitle={resetResult ? `For ${resetResult.username}` : ""}
        footer={<Button variant="primary" onClick={() => setResetResult(null)}>Done</Button>}>
        {resetResult && (
          <div className="space-y-3">
            <p className="text-sm text-ink-2">Share this password privately. The user must change it on next sign in. It won’t be shown again.</p>
            <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-4 py-3">
              <code className="text-lg font-bold text-ink tnum grow">{resetResult.tempPassword}</code>
              <Button variant="ghost" size="sm" icon={FiCopy} onClick={() => { navigator.clipboard?.writeText(resetResult.tempPassword); toast("Copied", "success"); }}>Copy</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
