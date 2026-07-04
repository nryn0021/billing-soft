import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { api } from "./api";
import { AppProvider } from "./context/AppContext";
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

function RequirePerm({ user, perm, children }) {
  return (user.permissions || []).includes(perm) ? children : <Navigate to="/" replace />;
}

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
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Suspense fallback={<PageFallback />}><Dashboard /></Suspense>} />
            <Route path="bills" element={<Suspense fallback={<PageFallback />}><Bills /></Suspense>} />
            <Route path="parties" element={<Suspense fallback={<PageFallback />}><Parties /></Suspense>} />
            <Route path="inventory" element={<Suspense fallback={<PageFallback />}><Inventory /></Suspense>} />
            <Route path="rates" element={<Suspense fallback={<PageFallback />}><RequirePerm user={user} perm="rates.view"><Rates /></RequirePerm></Suspense>} />
            <Route path="reports" element={<Suspense fallback={<PageFallback />}><RequirePerm user={user} perm="reports.view"><Reports /></RequirePerm></Suspense>} />
            <Route path="audit" element={<Suspense fallback={<PageFallback />}><RequirePerm user={user} perm="audit.view"><Audit /></RequirePerm></Suspense>} />
            <Route path="users" element={<Suspense fallback={<PageFallback />}><RequirePerm user={user} perm="users.view"><Users /></RequirePerm></Suspense>} />
            <Route path="settings" element={<Suspense fallback={<PageFallback />}><RequirePerm user={user} perm="settings.view"><Settings /></RequirePerm></Suspense>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster />
    </AppProvider>
  );
}
