import { Suspense, lazy, useEffect, useState } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { api } from "./api";
import { AppProvider, useApp } from "./context/AppContext";
import { Toaster } from "./ui";
import { LoadingScreen, LoginScreen, PasswordChangeScreen } from "./components/AuthScreen";
import AppLayout from "./components/layout/AppLayout";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Bills = lazy(() => import("./pages/Bills"));
const Parties = lazy(() => import("./pages/Parties"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Rates = lazy(() => import("./pages/Rates"));
const Reports = lazy(() => import("./pages/Reports"));
const Audit = lazy(() => import("./pages/Audit"));
const Users = lazy(() => import("./pages/Users"));
const Settings = lazy(() => import("./pages/Settings"));

function PageFallback() {
  return <div className="p-8 space-y-4 max-w-5xl mx-auto"><div className="skeleton h-10 w-64" /><div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-28" />)}</div><div className="skeleton h-72" /></div>;
}

// Reads the signed-in user from context (routes live inside AppProvider), so the router
// can be defined once at module scope — required for the data-router APIs (e.g. useBlocker).
function RequirePerm({ perm, children }) {
  const { user } = useApp();
  return (user.permissions || []).includes(perm) ? children : <Navigate to="/" replace />;
}

const page = (Comp) => <Suspense fallback={<PageFallback />}><Comp /></Suspense>;
const guarded = (perm, Comp) => <RequirePerm perm={perm}>{page(Comp)}</RequirePerm>;

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { index: true, element: page(Dashboard) },
      { path: "bills", element: page(Bills) },
      { path: "parties", element: page(Parties) },
      { path: "inventory", element: page(Inventory) },
      { path: "rates", element: guarded("rates.view", Rates) },
      { path: "reports", element: guarded("reports.view", Reports) },
      { path: "audit", element: guarded("audit.view", Audit) },
      { path: "users", element: guarded("users.view", Users) },
      { path: "settings", element: guarded("settings.view", Settings) },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);

export default function App() {
  const [status, setStatus] = useState("loading");
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => {
    api.session()
      .then((r) => { setUser(r.user); setData(r.data); setStatus("ready"); })
      .catch(() => setStatus("signed-out"));
  }, []);

  const login = async (tenant, username, password, remember) => {
    const r = await api.login(tenant, username, password, remember);
    setUser(r.user); setData(r.data); setStatus("ready");
  };

  const changePassword = async (password) => {
    await api.changePassword(password);
    setUser(null); setData(null); setStatus("signed-out");
  };

  const signedOut = () => { setUser(null); setData(null); setStatus("signed-out"); };

  if (status === "loading") return <LoadingScreen />;
  if (!user || status === "signed-out") return <LoginScreen onLogin={login} />;
  if (user.mustChangePassword) return <PasswordChangeScreen user={user} onChange={changePassword} />;

  return (
    <AppProvider user={user} data={data} onSignedOut={signedOut}>
      <RouterProvider router={router} />
      <Toaster />
    </AppProvider>
  );
}
