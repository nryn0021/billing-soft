import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { useTheme } from "../lib/hooks";
import { makeInvoiceQr } from "../lib/qr";

const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

export function AppProvider({ user: initialUser, data: initialData, onSignedOut, children }) {
  const [user, setUser] = useState(initialUser);
  const [data, setData] = useState(initialData);
  const [toasts, setToasts] = useState([]);
  const [printJob, setPrintJob] = useState(null); // { invoice, format, qr }
  const [theme, setTheme] = useTheme();
  const idRef = useRef(0);

  const settings = useMemo(() => data.settings || {}, [data.settings]);
  const permissions = useMemo(() => user.permissions || [], [user.permissions]);
  const can = useCallback((perm) => permissions.includes(perm), [permissions]);

  const dismissToast = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const toast = useCallback((message, tone = "default") => {
    const id = ++idRef.current;
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => dismissToast(id), 3800);
  }, [dismissToast]);

  // Generate/resolve the payment QR (uploaded image or a real UPI QR) before printing.
  const printInvoice = useCallback(async (invoice, format = "a4") => {
    let qr;
    try { qr = await makeInvoiceQr(settings, invoice, format); } catch { qr = ""; }
    setPrintJob({ invoice, format, qr });
    setTimeout(() => window.print(), 260);
  }, [settings]);

  const saveBill = useCallback(async (bill, { print = false, format = "a4" } = {}) => {
    const result = await api.createBill(bill);
    setData(result.data);
    if (print) await printInvoice(result.bill, format);
    toast(`${bill.type === "sale" ? "Sale" : "Purchase"} bill ${result.bill.id} saved`, "success");
    return result.bill;
  }, [printInvoice, toast]);

  const updateRate = useCallback(async (productId, rate) => {
    const result = await api.updateRate(productId, rate);
    setData(result.data);
    toast("Base rate updated", "success");
    return result.data;
  }, [toast]);

  const saveSettings = useCallback(async (patch) => {
    const result = await api.updateSettings(patch);
    setData((d) => ({ ...d, settings: result.settings }));
    toast("Settings saved", "success");
    return result.settings;
  }, [toast]);

  // Truck-sale master data + document numbering. Each returns the refreshed bootstrap `data`.
  const saveTransporter = useCallback(async (payload, id) => {
    const result = id ? await api.updateTransporter(id, payload) : await api.createTransporter(payload);
    setData(result.data);
    toast(id ? "Transporter updated" : "Transporter saved", "success");
    return result.data;
  }, [toast]);

  const saveVehicle = useCallback(async (payload, id) => {
    const result = id ? await api.updateVehicle(id, payload) : await api.createVehicle(payload);
    setData(result.data);
    toast(id ? "Vehicle updated" : "Vehicle saved", "success");
    return result.data;
  }, [toast]);

  const saveCounters = useCallback(async (patch) => {
    const result = await api.updateCounters(patch);
    setData(result.data);
    toast("Numbering updated", "success");
    return result.data;
  }, [toast]);

  // Truck tracking — patch a bill's dispatch status; server returns refreshed bootstrap data.
  const updateTracking = useCallback(async (billId, patch) => {
    const result = await api.updateTracking(billId, patch);
    setData(result.data);
    return result.data;
  }, []);

  const importTally = useCallback(async (xml) => {
    const result = await api.importTally(xml);
    setData(result.data);
    const s = result.summary;
    toast(`Tally import: ${s.created} added, ${s.updated} updated`, "success");
    return result.summary;
  }, [toast]);

  const refresh = useCallback(async () => {
    const result = await api.session();
    setUser(result.user);
    setData(result.data);
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } finally { onSignedOut?.(); }
  }, [onSignedOut]);

  const value = useMemo(() => ({
    user, data, setData, settings, permissions, can,
    toasts, toast, dismissToast,
    printJob, printInvoice, saveBill, updateRate, saveSettings, saveTransporter, saveVehicle, saveCounters,
    updateTracking, importTally, refresh, logout,
    theme, setTheme,
  }), [user, data, settings, permissions, can, toasts, toast, dismissToast, printJob, printInvoice, saveBill, updateRate, saveSettings, saveTransporter, saveVehicle, saveCounters, updateTracking, importTally, refresh, logout, theme, setTheme]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
