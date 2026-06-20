import { useState } from "react";
import { FiEye, FiEyeOff, FiLock, FiShield, FiUser } from "react-icons/fi";

export function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try { await onLogin(username, password, remember); }
    catch (reason) { setError(reason.message); }
    finally { setLoading(false); }
  };

  return (
    <main className="auth-screen">
      <section className="auth-story">
        <div className="auth-brand"><span>JM</span><div><strong>Jai Mata Di</strong><small>Gud Mill</small></div></div>
        <div className="auth-message"><span className="eyebrow">Secure mill operations</span><h1>Your business.<br />One clear view.</h1><p>Billing, stock, parties and payments for Amarpur and Samukhiya, kept together on your own computer.</p></div>
        <div className="auth-security"><FiShield /><span><strong>Private by design</strong><small>Your business database stays on this machine.</small></span></div>
      </section>
      <section className="auth-form-side">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-form-mark">JM</div>
          <span className="eyebrow">Welcome back</span>
          <h2>Sign in to continue</h2>
          <p>Use the account assigned by your administrator.</p>
          {error && <div className="auth-error">{error}</div>}
          <label><span>Username</span><div><FiUser /><input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" autoFocus placeholder="Enter your username" /></div></label>
          <label><span>Password</span><div><FiLock /><input type={visible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Enter your password" /><button type="button" onClick={() => setVisible(!visible)} aria-label="Show password">{visible ? <FiEyeOff /> : <FiEye />}</button></div></label>
          <label className="remember-row"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Keep me signed in on this device</span></label>
          <button className="auth-submit" disabled={loading}>{loading ? "Signing in..." : "Sign in securely"}</button>
          <small className="auth-help">Account access is managed by Jai Mata Di Gud Mill.</small>
        </form>
      </section>
    </main>
  );
}

export function PasswordChangeScreen({ user, onChange }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (event) => {
    event.preventDefault();
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    setError("");
    try { await onChange(password); } catch (reason) { setError(reason.message); setLoading(false); }
  };
  return <main className="password-screen"><form onSubmit={submit}><div className="password-icon"><FiShield /></div><span className="eyebrow">First sign in</span><h1>Create your private password</h1><p>Hello {user.displayName}. Replace the temporary password before continuing.</p>{error && <div className="auth-error">{error}</div>}<label><span>New password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /></label><label><span>Confirm password</span><input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" /></label><small>At least 10 characters with uppercase, lowercase, number and symbol.</small><button className="auth-submit" disabled={loading}>{loading ? "Saving..." : "Set password & sign in again"}</button></form></main>;
}

export function LoadingScreen() {
  return <main className="loading-screen"><div className="loading-mark">JM</div><span>Opening your mill workspace...</span></main>;
}
