import { useState } from "react";
import { motion } from "framer-motion";
import { FiArrowRight, FiCheck, FiEye, FiEyeOff, FiHome, FiLock, FiShield, FiUser } from "react-icons/fi";

function AuthShell({ children }) {
  return (
    <main className="min-h-screen grid lg:grid-cols-2 bg-bg">
      {/* brand side */}
      <section className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden text-white" style={{ background: "linear-gradient(150deg, var(--brand-2), var(--brand) 55%, #0a4a31)" }}>
        <div className="absolute -top-24 -right-24 size-[28rem] rounded-full opacity-20" style={{ background: "radial-gradient(circle, var(--accent), transparent 70%)" }} />
        <div className="absolute bottom-0 -left-20 size-[24rem] rounded-full opacity-10" style={{ background: "radial-gradient(circle, #fff, transparent 70%)" }} />
        <div className="relative flex items-center gap-3">
          <div className="size-11 rounded-2xl grid place-items-center bg-white/15 backdrop-blur font-extrabold">JM</div>
          <div><strong className="block font-[family-name:var(--font-display)] text-lg leading-tight">Jai Mata Di</strong><span className="text-xs uppercase tracking-[0.16em] text-white/70">Gud Mill</span></div>
        </div>
        <div className="relative">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold leading-tight">Your business.<br />One clear view.</h1>
          <p className="mt-4 text-white/75 max-w-sm">Billing, stock, party ledgers and reports for every branch — fast, secure and beautifully organised.</p>
          <ul className="mt-8 space-y-3">
            {["Atomic bill posting with live stock & ledgers", "Encrypted bank details, role-based access", "Reports & invoices ready to print or export"].map((t) => (
              <li key={t} className="flex items-center gap-3 text-sm text-white/85"><span className="grid place-items-center size-6 rounded-full bg-white/15"><FiCheck className="text-xs" /></span>{t}</li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">© {new Date().getFullYear()} Jai Mata Di Gud Mill · Secured with PostgreSQL</p>
      </section>

      {/* form side */}
      <section className="flex items-center justify-center p-6 sm:p-12">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-sm">
          {children}
        </motion.div>
      </section>
    </main>
  );
}

function InputRow({ icon: Icon, children }) {
  return (
    <div className="relative">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
      {children}
    </div>
  );
}

export function LoginScreen({ onLogin }) {
  const [tenant, setTenant] = useState("jmd");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try { await onLogin(tenant, username, password, remember); }
    catch (err) { setError(err.message); setLoading(false); }
  };

  return (
    <AuthShell>
      <div className="lg:hidden flex items-center gap-3 mb-8">
        <div className="size-11 rounded-2xl grid place-items-center text-white font-extrabold" style={{ background: "linear-gradient(145deg, var(--brand), var(--brand-2))" }}>JM</div>
        <div><strong className="block font-[family-name:var(--font-display)] text-lg leading-tight text-ink">Jai Mata Di</strong><span className="text-xs uppercase tracking-[0.16em] text-muted">Gud Mill</span></div>
      </div>
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">Welcome back</span>
      <h2 className="text-2xl font-bold text-ink mt-1">Sign in to continue</h2>
      <p className="text-sm text-muted mt-1">Use the account assigned by your administrator.</p>

      <form onSubmit={submit} className="mt-7 space-y-4">
        {error && <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2.5">{error}</motion.div>}
        <div>
          <label className="field-label">Mill code</label>
          <InputRow icon={FiHome}><input value={tenant} onChange={(e) => setTenant(e.target.value)} autoComplete="organization" placeholder="e.g. jmd" className="input pl-10" /></InputRow>
        </div>
        <div>
          <label className="field-label">Username</label>
          <InputRow icon={FiUser}><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus placeholder="Enter your username" className="input pl-10" /></InputRow>
        </div>
        <div>
          <label className="field-label">Password</label>
          <InputRow icon={FiLock}>
            <input type={visible ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter your password" className="input pl-10 pr-10" />
            <button type="button" onClick={() => setVisible((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink" aria-label="Toggle password">{visible ? <FiEyeOff /> : <FiEye />}</button>
          </InputRow>
        </div>
        <label className="flex items-center gap-2.5 text-sm text-ink-2 cursor-pointer select-none">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-4 accent-[var(--brand)]" />
          Keep me signed in on this device
        </label>
        <button className="btn btn-primary w-full h-11" disabled={loading}>{loading ? "Signing in…" : <>Sign in securely <FiArrowRight /></>}</button>
      </form>
      <p className="text-xs text-muted text-center mt-6">Access is managed by Jai Mata Di Gud Mill.</p>
    </AuthShell>
  );
}

export function PasswordChangeScreen({ user, onChange }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    setError(""); setLoading(true);
    try { await onChange(password); } catch (err) { setError(err.message); setLoading(false); }
  };

  return (
    <AuthShell>
      <div className="grid place-items-center size-12 rounded-2xl bg-brand/10 text-brand mb-5"><FiShield className="text-xl" /></div>
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-brand">First sign in</span>
      <h2 className="text-2xl font-bold text-ink mt-1">Create your private password</h2>
      <p className="text-sm text-muted mt-1">Hello {user.displayName}. Replace the temporary password before continuing.</p>
      <form onSubmit={submit} className="mt-7 space-y-4">
        {error && <div className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2.5">{error}</div>}
        <div><label className="field-label">New password</label><InputRow icon={FiLock}><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="input pl-10" autoFocus /></InputRow></div>
        <div><label className="field-label">Confirm password</label><InputRow icon={FiLock}><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className="input pl-10" /></InputRow></div>
        <p className="text-xs text-muted">At least 10 characters with uppercase, lowercase, number and symbol.</p>
        <button className="btn btn-primary w-full h-11" disabled={loading}>{loading ? "Saving…" : "Set password & continue"}</button>
      </form>
    </AuthShell>
  );
}

export function LoadingScreen() {
  return (
    <div className="min-h-screen grid place-items-center bg-bg">
      <div className="flex flex-col items-center gap-4">
        <motion.div className="size-12 rounded-2xl grid place-items-center text-white font-extrabold text-lg" style={{ background: "linear-gradient(145deg, var(--brand), var(--brand-2))" }}
          animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}>JM</motion.div>
        <div className="flex gap-1.5">{[0, 1, 2].map((i) => <motion.span key={i} className="size-2 rounded-full bg-brand" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }} />)}</div>
      </div>
    </div>
  );
}
