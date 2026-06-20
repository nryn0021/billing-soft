import { useEffect, useMemo, useState } from "react";
import {
  FiActivity,
  FiArrowDownLeft,
  FiArrowRight,
  FiArrowUpRight,
  FiBarChart2,
  FiBell,
  FiBookOpen,
  FiBox,
  FiChevronDown,
  FiClipboard,
  FiClock,
  FiCreditCard,
  FiEdit2,
  FiFileText,
  FiGrid,
  FiHome,
  FiLogOut,
  FiMenu,
  FiPackage,
  FiPlus,
  FiPrinter,
  FiSearch,
  FiSettings,
  FiShoppingBag,
  FiSliders,
  FiTrendingUp,
  FiUser,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { PRODUCT_COLORS } from "./data/seed";
import { api } from "./api";
import BillerWorkspace from "./components/BillerWorkspace";
import { LoadingScreen, LoginScreen, PasswordChangeScreen } from "./components/AuthScreen";

const kgPerUnit = { kg: 1, quintal: 100, tonne: 1000 };

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const preciseInr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const number = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

function App() {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.session().then((result) => {
      setUser(result.user);
      setData(result.data);
      setStatus("ready");
    }).catch(() => setStatus("signed-out"));
  }, []);

  const login = async (username, password, remember) => {
    const result = await api.login(username, password, remember);
    setUser(result.user);
    setData(result.data);
    setStatus("ready");
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    setData(null);
    setStatus("signed-out");
  };

  const changePassword = async (password) => {
    await api.changePassword(password);
    setUser(null);
    setData(null);
    setStatus("signed-out");
  };

  if (status === "loading") return <LoadingScreen />;
  if (!user || status === "signed-out") return <LoginScreen onLogin={login} />;
  if (user.mustChangePassword) return <PasswordChangeScreen user={user} onChange={changePassword} />;
  if (user.role === "biller") return <BillerWorkspace user={user} initialData={data} onData={setData} onLogout={logout} />;
  return <AdminApp initialData={data} user={user} onLogout={logout} />;
}

function AdminApp({ initialData, user, onLogout }) {
  const [data, setData] = useState(initialData);
  const [page, setPage] = useState("dashboard");
  const [branch, setBranch] = useState("All branches");
  const [mobileNav, setMobileNav] = useState(false);
  const [billType, setBillType] = useState(null);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [toast, setToast] = useState("");
  const role = user.role[0].toUpperCase() + user.role.slice(1);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const branchTransactions = useMemo(
    () =>
      branch === "All branches"
        ? data.transactions
        : data.transactions.filter((item) => item.branch === branch),
    [branch, data.transactions],
  );

  const openBilling = (type) => {
    if (role === "Manager") {
      setToast("Managers have view-only access to billing.");
      return;
    }
    setBillType(type);
  };

  const saveBill = async (bill, shouldPrint) => {
    const party = data.parties.find((item) => item.id === bill.partyId);
    const branchRecord = data.branches.find((item) => item.id === bill.branchId || item.name === bill.branch);
    try {
      const result = await api.createBill({ ...bill, party, branchId: branchRecord.id });
      setData(result.data);
      setBillType(null);
      setLastInvoice(result.bill);
      setToast(`${bill.type === "sale" ? "Sale" : "Purchase"} bill ${result.bill.id} saved.`);
      if (shouldPrint) window.setTimeout(() => window.print(), 200);
    } catch (error) {
      setToast(error.message);
      throw error;
    }
  };

  const updateRate = async (productId, newRate) => {
    const product = data.products.find((item) => item.id === productId);
    const rate = Number(newRate);
    if (!rate || rate === product.baseRate) return;
    try {
      const result = await api.updateRate(productId, rate);
      setData(result.data);
      setToast(`${product.name} base rate updated.`);
    } catch (error) { setToast(error.message); }
  };

  const navigate = (target) => {
    setPage(target);
    setMobileNav(false);
  };

  return (
    <>
      <div className="app-shell">
        <Sidebar page={page} navigate={navigate} mobileNav={mobileNav} close={() => setMobileNav(false)} />
        <main className="main-content">
          <Topbar
            page={page}
            branch={branch}
            setBranch={setBranch}
            role={role}
            setRole={setRole}
            openNav={() => setMobileNav(true)}
          />

          {page === "dashboard" && (
            <Dashboard
              data={data}
              transactions={branchTransactions}
              branch={branch}
              openBilling={openBilling}
              navigate={navigate}
            />
          )}
          {page === "bills" && (
            <TransactionsView transactions={branchTransactions} openBilling={openBilling} />
          )}
          {page === "parties" && <PartiesView parties={data.parties} />}
          {page === "inventory" && <InventoryView products={data.products} openBilling={openBilling} />}
          {page === "rates" && (
            <RatesView products={data.products} audits={data.audits} updateRate={updateRate} role={role} />
          )}
          {page === "reports" && <ReportsView data={data} transactions={branchTransactions} />}

          <footer className="app-footer">Jai Mata Di Gud Mill · Business records synced locally in this prototype</footer>
        </main>

        {billType && (
          <BillComposer
            type={billType}
            products={data.products}
            parties={data.parties}
            branches={data.branches}
            selectedBranch={branch}
            close={() => setBillType(null)}
            save={saveBill}
          />
        )}
        {toast && <div className="toast">{toast}</div>}
      </div>
      <PrintableInvoice invoice={lastInvoice} />
    </>
  );
}

function Sidebar({ page, navigate, mobileNav, close }) {
  const nav = [
    { id: "dashboard", label: "Overview", icon: FiGrid },
    { id: "bills", label: "Bills & Invoices", icon: FiFileText },
    { id: "parties", label: "Parties & Ledgers", icon: FiUsers },
    { id: "inventory", label: "Stock & Inventory", icon: FiPackage },
    { id: "rates", label: "Daily Rate Book", icon: FiSliders },
    { id: "reports", label: "Reports", icon: FiBarChart2 },
  ];
  return (
    <>
      {mobileNav && <button className="nav-backdrop" onClick={close} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">JM</div>
          <div>
            <strong>Jai Mata Di</strong>
            <span>Gud Mill</span>
          </div>
          <button className="close-nav" onClick={close} aria-label="Close navigation"><FiX /></button>
        </div>
        <div className="nav-section-label">Workspace</div>
        <nav>
          {nav.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => navigate(id)}>
              <Icon />
              <span>{label}</span>
              {id === "bills" && <small>12</small>}
            </button>
          ))}
        </nav>
        <div className="nav-section-label">Business</div>
        <nav>
          <button onClick={() => navigate("parties")}><FiCreditCard /><span>Payments & Dues</span></button>
          <button onClick={() => navigate("reports")}><FiBookOpen /><span>Audit Log</span></button>
          <button onClick={() => navigate("rates")}><FiSettings /><span>Settings</span></button>
        </nav>
        <div className="sidebar-help">
          <span><FiActivity /></span>
          <strong>Need a hand?</strong>
          <p>Business support and data help.</p>
          <button>Contact support</button>
        </div>
        <button className="logout"><FiLogOut /> Sign out</button>
      </aside>
    </>
  );
}

function Topbar({ page, branch, setBranch, role, setRole, openNav }) {
  const titles = {
    dashboard: ["Good morning, Prasen", "Here is what is happening at your mill today."],
    bills: ["Bills & Invoices", "Create, track and print every sale and purchase."],
    parties: ["Parties & Ledgers", "Customers, suppliers and every outstanding balance."],
    inventory: ["Stock & Inventory", "Live grain stock across both branches."],
    rates: ["Daily Rate Book", "Set today’s default buying and selling rates."],
    reports: ["Business Reports", "See performance across any reporting period."],
  };
  return (
    <header className="topbar">
      <button className="mobile-menu" onClick={openNav} aria-label="Open navigation"><FiMenu /></button>
      <div className="page-heading">
        <h1>{titles[page][0]} <span className="wave">✦</span></h1>
        <p>{titles[page][1]}</p>
      </div>
      <div className="topbar-actions">
        <label className="branch-select">
          <FiHome />
          <select value={branch} onChange={(event) => setBranch(event.target.value)}>
            <option>All branches</option>
            <option>Main Mill</option>
            <option>Market Yard</option>
          </select>
          <FiChevronDown />
        </label>
        <button className="icon-button" aria-label="Search"><FiSearch /></button>
        <button className="icon-button notification" aria-label="Notifications"><FiBell /><i /></button>
        <div className="profile">
          <div className="avatar">PN</div>
          <div><strong>Prasen Narayan</strong><span>{role}</span></div>
          <select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Demo role">
            <option>Admin</option>
            <option>Manager</option>
            <option>Biller</option>
          </select>
        </div>
      </div>
    </header>
  );
}

function Dashboard({ data, transactions, branch, openBilling, navigate }) {
  const today = transactions.filter((item) => new Date(item.date).toDateString() === new Date().toDateString());
  const sales = today.filter((item) => item.type === "sale").reduce((sum, item) => sum + item.netAmount, 0);
  const purchases = today.filter((item) => item.type === "purchase").reduce((sum, item) => sum + item.netAmount, 0);
  const stock = data.products.reduce((sum, item) => sum + item.stockKg, 0);
  const outstanding = data.parties.reduce((sum, item) => sum + item.balance, 0);
  const cards = [
    { label: "Today's sales", value: inr.format(sales), note: "+12.5% from yesterday", icon: FiTrendingUp, tone: "green" },
    { label: "Today's purchases", value: inr.format(purchases), note: "8 purchase bills", icon: FiShoppingBag, tone: "amber" },
    { label: "Total stock", value: `${number.format(stock / 1000)} T`, note: `Across ${branch === "All branches" ? "2 branches" : branch}`, icon: FiBox, tone: "blue" },
    { label: "Outstanding dues", value: inr.format(outstanding), note: "14 active party ledgers", icon: FiCreditCard, tone: "purple" },
  ];
  return (
    <div className="page-body">
      <section className="metric-grid">
        {cards.map(({ label, value, note, icon: Icon, tone }) => (
          <article className="metric-card" key={label}>
            <div className={`metric-icon ${tone}`}><Icon /></div>
            <div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>
            <button aria-label={`Open ${label}`} onClick={() => navigate(label.includes("stock") ? "inventory" : label.includes("dues") ? "parties" : "bills")}><FiArrowUpRight /></button>
          </article>
        ))}
      </section>

      <section className="quick-strip">
        <div><span className="eyebrow">Quick billing</span><h2>What would you like to record?</h2></div>
        <button className="quick-sale" onClick={() => openBilling("sale")}><span><FiArrowUpRight /></span><div><strong>New sale bill</strong><small>Sell grain to a party</small></div><FiArrowRight /></button>
        <button className="quick-purchase" onClick={() => openBilling("purchase")}><span><FiArrowDownLeft /></span><div><strong>New purchase bill</strong><small>Buy grain from a farmer</small></div><FiArrowRight /></button>
        <button className="text-action" onClick={() => navigate("parties")}><FiPlus /> Add party</button>
      </section>

      <div className="dashboard-grid">
        <SalesChart transactions={transactions} />
        <StockCard products={data.products} navigate={navigate} />
        <RecentTransactions transactions={transactions.slice(0, 6)} navigate={navigate} />
        <ActivityCard audits={data.audits} navigate={navigate} />
      </div>
    </div>
  );
}

function SalesChart({ transactions }) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const saleBars = [52, 64, 48, 76, 57, 91, 72];
  const purchaseBars = [34, 47, 60, 55, 42, 68, 50];
  const total = transactions.filter((item) => item.type === "sale").reduce((sum, item) => sum + item.netAmount, 0);
  return (
    <article className="panel chart-panel">
      <PanelHeader title="Sales & purchase overview" subtitle="This week" action="View report" />
      <div className="chart-total"><div><span>Total business</span><strong>{inr.format(total)}</strong></div><div className="chart-legend"><span><i className="sale-dot" />Sales</span><span><i className="purchase-dot" />Purchases</span></div></div>
      <div className="bar-chart">
        <div className="axis-labels"><span>₹3L</span><span>₹2L</span><span>₹1L</span><span>₹0</span></div>
        <div className="grid-lines"><i /><i /><i /><i /></div>
        <div className="bars">
          {days.map((day, index) => (
            <div className="day-bars" key={day}>
              <div><i className="sales-bar" style={{ height: `${saleBars[index]}%` }} /><i className="purchase-bar" style={{ height: `${purchaseBars[index]}%` }} /></div>
              <span>{day}</span>
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}

function StockCard({ products, navigate }) {
  const max = Math.max(...products.map((item) => item.stockKg));
  return (
    <article className="panel stock-card">
      <PanelHeader title="Stock position" subtitle="Live inventory" action="View all" onAction={() => navigate("inventory")} />
      <div className="stock-list">
        {products.slice(0, 5).map((item, index) => (
          <div className="stock-item" key={item.id}>
            <span className="grain-icon" style={{ background: PRODUCT_COLORS[index] }}>{item.short}</span>
            <div><strong>{item.name}</strong><span><i style={{ width: `${Math.max(12, (item.stockKg / max) * 100)}%`, background: PRODUCT_COLORS[index] }} /></span></div>
            <p><strong>{number.format(item.stockKg / 1000)} T</strong><small>{number.format(item.stockKg)} kg</small></p>
          </div>
        ))}
      </div>
      <div className="stock-alert"><FiActivity /><span><strong>Healthy stock levels</strong><small>Sonam Rice is moving fastest this week.</small></span></div>
    </article>
  );
}

function RecentTransactions({ transactions, navigate }) {
  return (
    <article className="panel recent-card">
      <PanelHeader title="Recent transactions" subtitle="Latest bills across branches" action="View all" onAction={() => navigate("bills")} />
      <div className="table-wrap">
        <table>
          <thead><tr><th>Bill</th><th>Party</th><th>Item</th><th>Weight</th><th>Amount</th><th>Status</th></tr></thead>
          <tbody>
            {transactions.map((item) => (
              <tr key={item.id}>
                <td><strong>{item.id}</strong><small>{formatDate(item.date)}</small></td>
                <td>{item.party}<small>{item.branch}</small></td>
                <td>{item.product}</td>
                <td>{number.format(item.totalKg / 100)} Qtl</td>
                <td><strong>{inr.format(item.netAmount)}</strong></td>
                <td><span className={`status-pill ${item.dueAmount ? "pending" : "paid"}`}>{item.dueAmount ? "Part paid" : "Paid"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}

function ActivityCard({ audits, navigate }) {
  return (
    <article className="panel activity-card">
      <PanelHeader title="Activity & alerts" subtitle="Things that need your attention" action="Audit log" onAction={() => navigate("rates")} />
      <div className="activity-list">
        {audits.slice(0, 4).map((item) => (
          <div key={item.id}><span className={item.kind === "override" ? "warning" : "info"}>{item.kind === "override" ? <FiEdit2 /> : <FiClock />}</span><p><strong>{item.text}</strong><small>{item.meta}</small><time>{timeAgo(item.date)}</time></p></div>
        ))}
      </div>
      <button className="outline-button" onClick={() => navigate("rates")}>Review rate changes <FiArrowRight /></button>
    </article>
  );
}

function TransactionsView({ transactions, openBilling }) {
  const [filter, setFilter] = useState("all");
  const visible = filter === "all" ? transactions : transactions.filter((item) => item.type === filter);
  return (
    <div className="page-body inner-page">
      <div className="page-tools">
        <div className="segmented"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All bills</button><button className={filter === "sale" ? "active" : ""} onClick={() => setFilter("sale")}>Sales</button><button className={filter === "purchase" ? "active" : ""} onClick={() => setFilter("purchase")}>Purchases</button></div>
        <div className="button-row"><button className="secondary-button" onClick={() => openBilling("purchase")}><FiArrowDownLeft /> New purchase</button><button className="primary-button" onClick={() => openBilling("sale")}><FiPlus /> New sale</button></div>
      </div>
      <article className="panel data-panel">
        <div className="data-toolbar"><label><FiSearch /><input placeholder="Search bill, party or item..." /></label><button><FiSliders /> Filter</button><button><FiPrinter /> Export</button></div>
        <div className="table-wrap full-table"><table><thead><tr><th>Bill no.</th><th>Type</th><th>Date</th><th>Party</th><th>Product</th><th>Weight</th><th>Rate / kg</th><th>Net amount</th><th>Due</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong>{item.id}</strong></td><td><span className={`type-pill ${item.type}`}>{item.type}</span></td><td>{formatDate(item.date)}</td><td>{item.party}<small>{item.branch}</small></td><td>{item.product}</td><td>{number.format(item.totalKg)} kg</td><td>{preciseInr.format(item.rate)}</td><td><strong>{inr.format(item.netAmount)}</strong></td><td className={item.dueAmount ? "amount-due" : "amount-clear"}>{item.dueAmount ? inr.format(item.dueAmount) : "Clear"}</td></tr>)}</tbody></table></div>
      </article>
    </div>
  );
}

function PartiesView({ parties }) {
  const debtors = parties.filter((item) => item.balanceType === "debtor").reduce((sum, item) => sum + item.balance, 0);
  const creditors = parties.filter((item) => item.balanceType === "creditor").reduce((sum, item) => sum + item.balance, 0);
  return (
    <div className="page-body inner-page">
      <section className="summary-banner"><div><span>Receivable from debtors</span><strong>{inr.format(debtors)}</strong></div><div><span>Payable to creditors</span><strong>{inr.format(creditors)}</strong></div><button className="primary-button"><FiPlus /> Add new party</button></section>
      <article className="panel data-panel">
        <div className="data-toolbar"><label><FiSearch /><input placeholder="Search by name, phone or party ID..." /></label><button><FiSliders /> All parties</button></div>
        <div className="party-grid">
          {parties.map((party) => <div className="party-card" key={party.id}><div className="party-avatar">{initials(party.name)}</div><div className="party-main"><span className={`ledger-label ${party.balanceType}`}>{party.balanceType}</span><h3>{party.name}</h3><p>{party.id} · {party.phone}</p><small>{party.address}</small></div><div className="party-balance"><span>{party.balanceType === "debtor" ? "You will receive" : "You have to pay"}</span><strong>{inr.format(party.balance)}</strong><button>View ledger <FiArrowRight /></button></div></div>)}
        </div>
      </article>
    </div>
  );
}

function InventoryView({ products, openBilling }) {
  const stock = products.reduce((sum, item) => sum + item.stockKg, 0);
  const value = products.reduce((sum, item) => sum + item.stockKg * item.baseRate, 0);
  return (
    <div className="page-body inner-page">
      <section className="inventory-summary"><div><FiPackage /><span>Total physical stock<strong>{number.format(stock / 1000)} tonnes</strong></span></div><div><FiCreditCard /><span>Estimated stock value<strong>{inr.format(value)}</strong></span></div><div className="button-row"><button className="secondary-button" onClick={() => openBilling("sale")}>Stock out</button><button className="primary-button" onClick={() => openBilling("purchase")}>Stock in</button></div></section>
      <div className="inventory-grid">{products.map((item, index) => <article className="inventory-card" key={item.id}><div className="inventory-card-top"><span className="grain-icon large" style={{ background: PRODUCT_COLORS[index % PRODUCT_COLORS.length] }}>{item.short}</span><span className="healthy">In stock</span></div><h3>{item.name}</h3><p>{item.category}</p><strong>{number.format(item.stockKg / 1000)} <small>tonnes</small></strong><div><span>{number.format(item.stockKg)} kg available</span><span>@ {preciseInr.format(item.baseRate)}/kg</span></div><button onClick={() => openBilling("sale")}>Create sale bill <FiArrowRight /></button></article>)}</div>
    </div>
  );
}

function RatesView({ products, audits, updateRate, role }) {
  return (
    <div className="page-body inner-page rates-layout">
      <article className="panel rate-book"><div className="rate-heading"><div><span className="eyebrow">Price book</span><h2>Base rates for today</h2><p>Billers can override these values while billing. Every override is recorded.</p></div><span className="edit-access"><FiUser /> {role === "Biller" ? "View only" : `${role} can edit`}</span></div>
        <div className="rate-list">{products.map((product) => <RateRow key={`${product.id}-${product.baseRate}`} product={product} updateRate={updateRate} canEdit={role !== "Biller"} />)}</div>
      </article>
      <article className="panel audit-panel"><PanelHeader title="Rate audit trail" subtitle="Latest changes and overrides" /><div className="audit-list">{audits.map((item) => <div key={item.id}><span className={item.kind}>{item.kind === "override" ? <FiEdit2 /> : <FiTrendingUp />}</span><p><strong>{item.text}</strong><small>{item.meta}</small><time>{formatDateTime(item.date)}</time></p></div>)}</div></article>
    </div>
  );
}

function RateRow({ product, updateRate, canEdit }) {
  const [rate, setRate] = useState(product.baseRate);
  return <div className="rate-row"><div className="grain-icon">{product.short}</div><div><strong>{product.name}</strong><small>{product.category}</small></div><label><span>₹</span><input type="number" step="0.01" min="0" value={rate} onChange={(event) => setRate(event.target.value)} disabled={!canEdit} /><small>per kg</small></label><button disabled={!canEdit || Number(rate) === product.baseRate} onClick={() => updateRate(product.id, rate)}>Update</button></div>;
}

function ReportsView({ data, transactions }) {
  const sales = transactions.filter((item) => item.type === "sale").reduce((sum, item) => sum + item.netAmount, 0);
  const purchases = transactions.filter((item) => item.type === "purchase").reduce((sum, item) => sum + item.netAmount, 0);
  const profit = sales - purchases;
  return (
    <div className="page-body inner-page">
      <div className="page-tools"><div className="segmented"><button>Day</button><button>Week</button><button className="active">Month</button><button>Quarter</button><button>FY 2026-27</button></div><button className="secondary-button"><FiPrinter /> Export report</button></div>
      <section className="report-cards"><div><span>Gross sales</span><strong>{inr.format(sales)}</strong><small>Across {transactions.filter((item) => item.type === "sale").length} bills</small></div><div><span>Total purchases</span><strong>{inr.format(purchases)}</strong><small>Across {transactions.filter((item) => item.type === "purchase").length} bills</small></div><div><span>Gross difference</span><strong className={profit >= 0 ? "positive" : "negative"}>{inr.format(profit)}</strong><small>Before expenses and taxes</small></div><div><span>Stock value</span><strong>{inr.format(data.products.reduce((sum, item) => sum + item.stockKg * item.baseRate, 0))}</strong><small>At current base rates</small></div></section>
      <div className="reports-grid"><SalesChart transactions={transactions} /><article className="panel product-report"><PanelHeader title="Top products" subtitle="By billed value" /><div>{data.products.slice(0, 6).map((item, index) => <p key={item.id}><span><i>{index + 1}</i>{item.name}</span><strong>{number.format(item.stockKg / 1000)} T</strong></p>)}</div></article></div>
    </div>
  );
}

function BillComposer({ type, products, parties, branches, selectedBranch, close, save }) {
  const eligibleParties = parties.filter((party) => type === "sale" ? party.kind !== "supplier" : party.kind !== "customer");
  const [form, setForm] = useState({
    type,
    partyId: eligibleParties[0]?.id || "",
    productId: products[0].id,
    quantity: "21.2",
    unit: "quintal",
    rate: String(products[0].baseRate),
    branch: selectedBranch === "All branches" ? branches[0] : selectedBranch,
    paymentMethod: type === "purchase" ? "Cash" : "Online",
    paidAmount: "0",
    applyCd: type === "purchase",
  });
  const product = products.find((item) => item.id === form.productId);
  const totalKg = Number(form.quantity || 0) * kgPerUnit[form.unit];
  const gross = totalKg * Number(form.rate || 0);
  const deduction = type === "purchase" && form.applyCd && gross > 20000 ? gross * 0.025 : 0;
  const net = gross - deduction;
  const due = Math.max(0, net - Number(form.paidAmount || 0));
  const isOverride = Number(form.rate) !== product.baseRate;
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const changeProduct = (id) => {
    const next = products.find((item) => item.id === id);
    setForm((current) => ({ ...current, productId: id, rate: String(next.baseRate) }));
  };
  const submit = (event, print = false) => {
    event.preventDefault();
    if (!form.partyId || !form.quantity || Number(form.quantity) <= 0 || !form.rate) return;
    save(form, print);
  };
  return (
    <div className="modal-layer" role="dialog" aria-modal="true">
      <button className="modal-backdrop" onClick={close} aria-label="Close bill composer" />
      <div className="bill-drawer">
        <header><div className={`bill-title-icon ${type}`}><FiFileText /></div><div><span>{type === "sale" ? "SALES INVOICE" : "PURCHASE VOUCHER"}</span><h2>Create {type} bill</h2></div><button onClick={close}><FiX /></button></header>
        <form onSubmit={submit}>
          <div className="form-section"><h3><span>1</span> Bill details</h3><div className="form-grid">
            <label className="wide"><span>Party *</span><select value={form.partyId} onChange={(event) => update("partyId", event.target.value)}>{eligibleParties.map((party) => <option value={party.id} key={party.id}>{party.name} · {party.id}</option>)}</select></label>
            <label><span>Branch *</span><select value={form.branch} onChange={(event) => update("branch", event.target.value)}>{branches.map((item) => <option key={item}>{item}</option>)}</select></label>
          </div></div>
          <div className="form-section"><h3><span>2</span> Grain & weight</h3><div className="form-grid three">
            <label className="wide"><span>Product *</span><select value={form.productId} onChange={(event) => changeProduct(event.target.value)}>{products.map((item) => <option value={item.id} key={item.id}>{item.name} · Stock {number.format(item.stockKg / 1000)} T</option>)}</select></label>
            <label><span>Quantity *</span><input type="number" min="0" step="0.01" value={form.quantity} onChange={(event) => update("quantity", event.target.value)} /></label>
            <label><span>Unit *</span><select value={form.unit} onChange={(event) => update("unit", event.target.value)}><option value="kg">Kilogram (kg)</option><option value="quintal">Quintal (100 kg)</option><option value="tonne">Tonne (1,000 kg)</option></select></label>
          </div><div className="conversion-note"><FiActivity /> {form.quantity || 0} {form.unit} = <strong>{number.format(totalKg)} kg</strong></div></div>
          <div className="form-section"><h3><span>3</span> Rate & payment</h3><div className="form-grid three">
            <label><span>Rate per kg *</span><div className={`money-input ${isOverride ? "overridden" : ""}`}><i>₹</i><input type="number" min="0" step="0.01" value={form.rate} onChange={(event) => update("rate", event.target.value)} /></div><small className={isOverride ? "override-note" : ""}>{isOverride ? `Override: base rate is ${preciseInr.format(product.baseRate)}` : "Using today's base rate"}</small></label>
            <label><span>Payment method</span><select value={form.paymentMethod} onChange={(event) => update("paymentMethod", event.target.value)}><option>Cash</option><option>Online / Bank</option><option>Split payment</option><option>Credit</option></select></label>
            <label><span>Amount paid now</span><div className="money-input"><i>₹</i><input type="number" min="0" max={net} step="0.01" value={form.paidAmount} onChange={(event) => update("paidAmount", event.target.value)} /></div></label>
          </div>
          {type === "purchase" && <label className="check-row"><input type="checkbox" checked={form.applyCd} onChange={(event) => update("applyCd", event.target.checked)} /><span><strong>Apply 2.5% CD deduction above ₹20,000</strong><small>This rule is configurable and is shown on the voucher.</small></span></label>}
          </div>
          <aside className="bill-summary"><div><span>Gross amount</span><strong>{preciseInr.format(gross)}</strong></div>{type === "purchase" && <div className="deduction"><span>CD deduction {deduction ? "(2.5%)" : ""}</span><strong>- {preciseInr.format(deduction)}</strong></div>}<div className="net-total"><span>Net {type === "sale" ? "receivable" : "payable"}</span><strong>{preciseInr.format(net)}</strong></div><div><span>Balance due</span><strong>{preciseInr.format(due)}</strong></div></aside>
          <footer><button type="button" className="cancel-button" onClick={close}>Cancel</button><button type="button" className="secondary-button" onClick={(event) => submit(event, true)}><FiPrinter /> Save & print</button><button className="primary-button" type="submit"><FiClipboard /> Save bill</button></footer>
        </form>
      </div>
    </div>
  );
}

function PrintableInvoice({ invoice }) {
  if (!invoice) return null;
  return <section className="print-invoice"><header><div><strong>JAI MATA DI GUD MILL</strong><span>Grain Trading & Processing</span></div><h1>{invoice.type === "sale" ? "TAX INVOICE" : "PURCHASE VOUCHER"}</h1></header><div className="invoice-meta"><p><span>Bill number</span><strong>{invoice.id}</strong></p><p><span>Date</span><strong>{formatDate(invoice.date)}</strong></p><p><span>Branch</span><strong>{invoice.branch}</strong></p><p><span>Party</span><strong>{invoice.party}</strong></p></div><table><thead><tr><th>Description</th><th>Weight</th><th>Rate/kg</th><th>Amount</th></tr></thead><tbody><tr><td>{invoice.product}</td><td>{number.format(invoice.totalKg)} kg</td><td>{preciseInr.format(invoice.rate)}</td><td>{preciseInr.format(invoice.gross)}</td></tr></tbody></table><div className="invoice-totals"><p><span>Gross</span><strong>{preciseInr.format(invoice.gross)}</strong></p>{invoice.cdDeduction > 0 && <p><span>CD deduction</span><strong>- {preciseInr.format(invoice.cdDeduction)}</strong></p>}<p className="grand"><span>Net amount</span><strong>{preciseInr.format(invoice.netAmount)}</strong></p><p><span>Paid</span><strong>{preciseInr.format(invoice.paidAmount)}</strong></p><p><span>Balance due</span><strong>{preciseInr.format(invoice.dueAmount)}</strong></p></div><footer><span>Authorised signatory</span><span>Party signature</span></footer></section>;
}

function PanelHeader({ title, subtitle, action, onAction }) {
  return <header className="panel-header"><div><h2>{title}</h2><p>{subtitle}</p></div>{action && <button onClick={onAction}>{action} <FiArrowRight /></button>}</header>;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function timeAgo(value) {
  const hours = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 3600000));
  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

function initials(name) {
  return name.split(" ").slice(0, 2).map((part) => part[0]).join("");
}

export default App;
