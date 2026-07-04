import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  FiBarChart2, FiBell, FiCheck, FiChevronLeft, FiChevronRight, FiCommand, FiFileText, FiGrid, FiHome,
  FiInfo, FiLock, FiLogOut, FiMenu, FiPackage, FiPlus, FiSearch, FiSettings, FiShield, FiSliders,
  FiUser, FiUserCheck, FiUsers, FiX, FiArrowDownLeft, FiArrowUpRight, FiChevronDown, FiCornerDownLeft,
} from "react-icons/fi";
import { api } from "../../api";
import { useApp } from "../../context/AppContext";
import { useHotkeys, useLocalStorage, useMediaQuery } from "../../lib/hooks";
import { Avatar, Badge, Button, Field, IconButton, Modal, ThemeToggle, cx } from "../../ui";
import { BillComposer } from "../../billing/BillComposer";
import { PrintInvoice } from "../../print/Invoice";
import { inr, titleCase, txProductLabel } from "../../lib/format";

// Nav is permission-driven: each item is shown only if the user holds `perm`.
const NAV = [
  { to: "/", label: "Overview", icon: FiGrid, perm: "dashboard.view", end: true },
  { to: "/bills", label: "Bills & Invoices", icon: FiFileText, perm: "bills.view" },
  { to: "/parties", label: "Parties & Ledgers", icon: FiUsers, perm: "parties.view" },
  { to: "/inventory", label: "Stock & Inventory", icon: FiPackage, perm: "inventory.view" },
  { to: "/rates", label: "Rate Book", icon: FiSliders, perm: "rates.view" },
  { to: "/reports", label: "Reports", icon: FiBarChart2, perm: "reports.view" },
  { to: "/audit", label: "Audit Log", icon: FiShield, perm: "audit.view" },
  { to: "/users", label: "Users & Access", icon: FiUserCheck, perm: "users.view" },
  { to: "/settings", label: "Settings", icon: FiSettings, perm: "settings.view" },
];

const TITLES = {
  "/": ["Overview", "Your mill at a glance"],
  "/bills": ["Bills & Invoices", "Create, track and print every sale and purchase"],
  "/parties": ["Parties & Ledgers", "Customers, suppliers and outstanding balances"],
  "/inventory": ["Stock & Inventory", "Live grain stock across branches"],
  "/rates": ["Rate Book", "Today's default buying and selling rates"],
  "/reports": ["Reports & Analytics", "Performance across any reporting period"],
  "/audit": ["Audit Log", "Every change, with user, time, IP and device"],
  "/users": ["Users & Access", "Secure logins and branch permissions"],
  "/settings": ["Settings", "Preferences, security and business profile"],
};

export default function AppLayout() {
  const { user, data, toast, printJob } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [collapsed, setCollapsed] = useLocalStorage("jmd-nav-collapsed", false);
  const [mobileNav, setMobileNav] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bill, setBill] = useState(null);

  const branches = data.branches;
  const isBiller = user.role === "biller";
  const [branch, setBranch] = useState(isBiller ? (branches.find((b) => b.id === user.branchId)?.name || "All branches") : "All branches");

  useEffect(() => { setMobileNav(false); }, [location.pathname]);
  useHotkeys({ "mod+k": () => setPaletteOpen((o) => !o), "escape": () => setPaletteOpen(false) });

  const perms = user.permissions || [];
  const nav = NAV.filter((n) => perms.includes(n.perm));
  const canBill = perms.includes("bills.create");

  const openBill = (type) => {
    if (!canBill) { toast("You do not have permission to create bills", "warning"); return; }
    setBill({ type });
  };

  const [title, subtitle] = TITLES[location.pathname] || [
    location.pathname.replace("/", "") || "Overview", "",
  ];

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* mobile backdrop */}
      <AnimatePresence>
        {mobileNav && !isDesktop && (
          <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setMobileNav(false)} aria-label="Close navigation" className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px] lg:hidden" />
        )}
      </AnimatePresence>

      <Sidebar nav={nav} user={user} collapsed={collapsed && isDesktop} mobileOpen={mobileNav}
        onToggle={() => setCollapsed((c) => !c)} onClose={() => setMobileNav(false)} onNewBill={openBill} isBiller={isBiller} />

      <div className={cx("min-h-screen flex flex-col transition-[margin] duration-300", isDesktop ? (collapsed ? "ml-[76px]" : "ml-[248px]") : "ml-0")}>
        <Topbar title={title} subtitle={subtitle} user={user} branch={branch} setBranch={setBranch} branches={branches}
          isBiller={isBiller} onMenu={() => setMobileNav(true)} onSearch={() => setPaletteOpen(true)} onNewBill={openBill} canBill={canBill} />

        <main className="grow px-4 sm:px-6 lg:px-8 py-6">
          <Outlet context={{ openBill, branch, setBranch }} />
        </main>

        <footer className="px-6 py-4 text-center text-xs text-muted border-t border-line">
          Jai Mata Di Gud Mill · Grain billing &amp; inventory · Data secured in PostgreSQL
        </footer>
      </div>

      <AnimatePresence>{bill && <BillComposer type={bill.type} defaultBranch={branch} onClose={() => setBill(null)} />}</AnimatePresence>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} nav={nav} data={data} navigate={navigate} onNewBill={openBill} canBill={canBill} />
      {printJob && <PrintInvoice />}
    </div>
  );
}

function Sidebar({ nav, user, collapsed, mobileOpen, onToggle, onClose, onNewBill, isBiller }) {
  const { logout } = useApp();
  return (
    <aside className={cx(
      "fixed inset-y-0 left-0 z-50 flex flex-col bg-surface border-r border-line transition-all duration-300",
      collapsed ? "w-[76px]" : "w-[248px]",
      "lg:translate-x-0", mobileOpen ? "translate-x-0 w-[248px] shadow-pop" : "-translate-x-full lg:translate-x-0",
    )}>
      <div className={cx("flex items-center gap-2.5 h-16 px-4 border-b border-line shrink-0", collapsed && "justify-center px-0")}>
        <div className="size-9 rounded-xl grid place-items-center text-white font-extrabold text-xs shrink-0 shadow-soft" style={{ background: "linear-gradient(145deg, var(--brand), var(--brand-2))" }}>JM</div>
        {!collapsed && <div className="min-w-0"><strong className="block text-sm font-bold text-ink leading-tight truncate font-[family-name:var(--font-display)]">Jai Mata Di</strong><span className="block text-[10px] uppercase tracking-[0.14em] text-muted">Gud Mill</span></div>}
        <button onClick={onClose} className="ml-auto lg:hidden text-muted p-1"><FiX /></button>
      </div>

      <div className={cx("px-3 pt-4", collapsed && "px-2")}>
        <button onClick={() => onNewBill("sale")} className={cx("btn btn-primary w-full", collapsed && "px-0")} title="New bill">
          <FiPlus />{!collapsed && "New bill"}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {!collapsed && <p className="px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Workspace</p>}
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} title={collapsed ? label : undefined}
            className={({ isActive }) => cx(
              "flex items-center gap-3 h-10 rounded-xl px-3 text-sm font-medium transition-colors relative",
              collapsed && "justify-center px-0",
              isActive ? "bg-brand/10 text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}>
            {({ isActive }) => (<>
              {isActive && <motion.span layoutId="nav-active" className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-brand" />}
              <Icon className="text-[1.15rem] shrink-0" />{!collapsed && <span className="truncate">{label}</span>}
            </>)}
          </NavLink>
        ))}
      </nav>

      <div className={cx("p-3 border-t border-line space-y-1", collapsed && "px-2")}>
        <button onClick={onToggle} className="hidden lg:flex items-center gap-3 h-9 w-full rounded-lg px-3 text-sm text-muted hover:text-ink hover:bg-surface-2 transition-colors">
          {collapsed ? <FiChevronRight /> : <><FiChevronLeft /><span>Collapse</span></>}
        </button>
        <button onClick={logout} title="Sign out" className={cx("flex items-center gap-3 h-10 w-full rounded-xl px-3 text-sm font-medium text-ink-2 hover:bg-danger/10 hover:text-danger transition-colors", collapsed && "justify-center px-0")}>
          <FiLogOut className="shrink-0" />{!collapsed && "Sign out"}
        </button>
        {!collapsed && (
          <div className="flex items-center gap-2.5 pt-2 px-1">
            <Avatar name={user.displayName} className="size-8" />
            <div className="min-w-0"><p className="text-xs font-semibold text-ink truncate">{user.displayName}</p><p className="text-[10px] text-muted capitalize">{user.role}{isBiller && user.branch ? ` · ${user.branch}` : ""}</p></div>
          </div>
        )}
      </div>
    </aside>
  );
}

function Topbar({ title, subtitle, user, branch, setBranch, branches, isBiller, onMenu, onSearch, onNewBill, canBill }) {
  return (
    <header className="sticky top-0 z-30 glass border-b border-line">
      <div className="flex items-center gap-3 h-16 px-4 sm:px-6">
        <button onClick={onMenu} className="lg:hidden btn btn-ghost btn-icon" aria-label="Menu"><FiMenu /></button>
        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-ink leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-muted truncate hidden sm:block">{subtitle}</p>}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button onClick={onSearch} className="hidden md:flex items-center gap-2 h-9 pl-3 pr-2 rounded-xl bg-surface-2 border border-line text-sm text-muted hover:text-ink hover:border-line transition-colors">
            <FiSearch className="text-base" /><span>Search…</span><span className="kbd ml-3"><FiCommand className="text-[0.8em]" />K</span>
          </button>
          <button onClick={onSearch} className="md:hidden btn btn-ghost btn-icon" aria-label="Search"><FiSearch /></button>

          {!isBiller && (
            <label className="hidden sm:flex items-center gap-1.5 h-9 px-2.5 rounded-xl bg-surface-2 border border-line text-sm text-ink-2">
              <FiHome className="text-muted" />
              <select value={branch} onChange={(e) => setBranch(e.target.value)} className="bg-transparent outline-none font-medium text-xs pr-1 cursor-pointer">
                <option>All branches</option>
                {branches.map((b) => <option key={b.id}>{b.name}</option>)}
              </select>
            </label>
          )}

          <ThemeToggle />
          <IconButton icon={FiBell} label="Notifications" className="relative hidden sm:inline-flex" />
          {canBill && <button onClick={() => onNewBill("sale")} className="btn btn-primary btn-sm hidden lg:inline-flex"><FiPlus />New bill</button>}
          <UserMenu user={user} />
        </div>
      </div>
    </header>
  );
}

/* ------------------------------ User account menu ------------------------------ */
function UserMenu({ user }) {
  const { logout } = useApp();
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(null); // "account" | "password"
  const isBiller = user.role === "biller";

  const items = [
    { label: "My account", icon: FiUser, run: () => setModal("account") },
    { label: "Account details", icon: FiInfo, run: () => setModal("account") },
    { label: "Change password", icon: FiLock, run: () => setModal("password") },
  ];

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className="flex items-center gap-1.5 rounded-xl pl-0.5 pr-1 py-0.5 hover:bg-surface-2 transition-colors">
        <Avatar name={user.displayName} className="size-9" />
        <FiChevronDown className={cx("text-muted transition-transform hidden sm:block", open && "rotate-180")} />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button className="fixed inset-0 z-40" aria-label="Close menu" onClick={() => setOpen(false)} />
            <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 420, damping: 30 }}
              className="absolute right-0 mt-2 z-50 w-64 card p-1.5 shadow-pop origin-top-right">
              <div className="flex items-center gap-3 px-2.5 py-2.5">
                <Avatar name={user.displayName} className="size-10 text-sm" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink truncate">{user.displayName}</p>
                  <p className="text-xs text-muted truncate">@{user.username}</p>
                </div>
              </div>
              <div className="px-2.5 pb-2">
                <Badge className="capitalize">{titleCase(user.role)}{isBiller && user.branch ? ` · ${user.branch}` : ""}</Badge>
              </div>
              <div className="border-t border-line pt-1">
                {items.map(({ label, icon: Icon, run }) => (
                  <button key={label} role="menuitem" onClick={() => { setOpen(false); run(); }}
                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-ink-2 hover:bg-surface-2 hover:text-ink transition-colors">
                    <Icon className="text-base shrink-0" />{label}
                  </button>
                ))}
              </div>
              <div className="border-t border-line mt-1 pt-1">
                <button role="menuitem" onClick={() => { setOpen(false); logout(); }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium text-danger hover:bg-danger/10 transition-colors">
                  <FiLogOut className="text-base shrink-0" />Sign out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AccountModal open={modal === "account"} onClose={() => setModal(null)} user={user} onChangePassword={() => setModal("password")} />
      <ChangePasswordModal open={modal === "password"} onClose={() => setModal(null)} />
    </div>
  );
}

function AccountModal({ open, onClose, user, onChangePassword }) {
  const rows = [
    ["Full name", user.displayName],
    ["Username", `@${user.username}`],
    ["Role", titleCase(user.role)],
    ["Branch", user.branch || "All branches"],
  ];
  return (
    <Modal open={open} onClose={onClose} size="sm" title="My account" subtitle="Your profile and access level">
      <div className="flex items-center gap-3 mb-4">
        <Avatar name={user.displayName} className="size-12 text-base" />
        <div className="min-w-0">
          <p className="font-semibold text-ink truncate">{user.displayName}</p>
          <Badge className="capitalize mt-1">{titleCase(user.role)}</Badge>
        </div>
      </div>
      <div className="rounded-xl border border-line divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between px-4 py-2.5 text-sm"><span className="text-muted">{k}</span><span className="font-medium text-ink text-right">{v}</span></div>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="ghost" icon={FiLock} onClick={onChangePassword}>Change password</Button>
      </div>
    </Modal>
  );
}

function ChangePasswordModal({ open, onClose }) {
  const { toast } = useApp();
  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault();
    if (pw.next !== pw.confirm) return toast("New passwords do not match", "danger");
    setBusy(true);
    try {
      await api.changePassword(pw.next);
      toast("Password changed — please sign in again", "success");
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) { toast(err.message, "danger"); setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} size="sm" title="Change password" subtitle="You will sign in again with the new password"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" icon={FiCheck} disabled={busy || !pw.next} onClick={() => submit()}>{busy ? "Saving…" : "Update password"}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="New password" hint="10+ characters with uppercase, lowercase, number & symbol">
          <input type="password" className="input" value={pw.next} onChange={(e) => setPw((c) => ({ ...c, next: e.target.value }))} autoFocus />
        </Field>
        <Field label="Confirm new password">
          <input type="password" className="input" value={pw.confirm} onChange={(e) => setPw((c) => ({ ...c, confirm: e.target.value }))} />
        </Field>
      </form>
    </Modal>
  );
}

/* ------------------------------ Command palette ------------------------------ */
function CommandPalette({ open, onClose, nav, data, navigate, onNewBill, canBill }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  useEffect(() => { if (open) { setQ(""); setActive(0); } }, [open]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    const groups = [];
    if (canBill) {
      const actions = [
        { id: "new-sale", label: "New sale bill", icon: FiArrowUpRight, run: () => onNewBill("sale") },
        { id: "new-purchase", label: "New purchase bill", icon: FiArrowDownLeft, run: () => onNewBill("purchase") },
      ].filter((a) => !query || a.label.toLowerCase().includes(query));
      if (actions.length) groups.push({ heading: "Actions", items: actions });
    }
    const pages = nav.filter((n) => !query || n.label.toLowerCase().includes(query)).map((n) => ({ id: `nav${n.to}`, label: n.label, icon: n.icon, sub: "Page", run: () => navigate(n.to) }));
    if (pages.length) groups.push({ heading: "Pages", items: pages });
    if (query) {
      const parties = data.parties.filter((p) => p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query) || p.phone.includes(query)).slice(0, 5)
        .map((p) => ({ id: `pty${p.id}`, label: p.name, icon: FiUsers, sub: `${p.id} · ${inr.format(p.balance)}`, run: () => navigate(`/parties?focus=${p.id}`) }));
      if (parties.length) groups.push({ heading: "Parties", items: parties });
      const products = data.products.filter((p) => p.name.toLowerCase().includes(query)).slice(0, 4)
        .map((p) => ({ id: `prd${p.id}`, label: p.name, icon: FiPackage, sub: `${p.stockKg.toLocaleString()} kg`, run: () => navigate("/inventory") }));
      if (products.length) groups.push({ heading: "Products", items: products });
      const bills = data.transactions.filter((t) => t.id.toLowerCase().includes(query) || t.party.toLowerCase().includes(query)).slice(0, 5)
        .map((t) => ({ id: `bill${t.id}`, label: `${t.id} · ${t.party}`, icon: FiFileText, sub: `${txProductLabel(t)} · ${inr.format(t.netAmount)}`, run: () => navigate(`/bills?focus=${t.id}`) }));
      if (bills.length) groups.push({ heading: "Bills", items: bills });
    }
    return groups;
  }, [q, nav, data, navigate, onNewBill, canBill]);

  const flat = results.flatMap((g) => g.items);
  const choose = (item) => { onClose(); setTimeout(() => item.run(), 60); };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(flat.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter" && flat[active]) { e.preventDefault(); choose(flat[active]); }
  };

  return createPalettePortal(open, onClose, (
    <div className="w-full max-w-xl card overflow-hidden shadow-pop" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3 px-4 h-14 border-b border-line">
        <FiSearch className="text-muted text-lg" />
        <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKeyDown}
          placeholder="Search parties, bills, products or jump to a page…" className="grow bg-transparent outline-none text-[0.95rem] placeholder:text-muted" />
        <span className="kbd">Esc</span>
      </div>
      <div className="max-h-[52vh] overflow-y-auto p-2">
        {flat.length === 0 && <p className="text-sm text-muted text-center py-8">No matches found</p>}
        {results.map((group) => (
          <div key={group.heading} className="mb-1">
            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">{group.heading}</p>
            {group.items.map((item) => {
              const idx = flat.indexOf(item);
              const Icon = item.icon;
              return (
                <button key={item.id} onMouseEnter={() => setActive(idx)} onClick={() => choose(item)}
                  className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors", idx === active ? "bg-brand/10 text-ink" : "text-ink-2 hover:bg-surface-2")}>
                  <span className="grid place-items-center size-8 rounded-lg bg-surface-3 text-ink-2 shrink-0"><Icon /></span>
                  <span className="min-w-0"><span className="block text-sm font-medium text-ink truncate">{item.label}</span>{item.sub && <span className="block text-xs text-muted truncate">{item.sub}</span>}</span>
                  {idx === active && <FiCornerDownLeft className="ml-auto text-muted shrink-0" />}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  ));
}

function createPalettePortal(open, onClose, children) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[150] flex items-start justify-center pt-[12vh] px-4 bg-black/45 backdrop-blur-[3px]" onClick={onClose}>
          <motion.div initial={{ opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: -6 }} transition={{ type: "spring", stiffness: 360, damping: 30 }} className="w-full flex justify-center">
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
