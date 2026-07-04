import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomInt } from "node:crypto";
import {
  adjustStock,
  adminResetPassword,
  changePassword,
  consumeResetToken,
  createBill,
  createResetToken,
  createSession,
  createUser,
  deleteSession,
  findTenantBySlug,
  findUser,
  getBootstrap,
  getSettings,
  listAudit,
  listStockMovements,
  listUsers,
  logAudit,
  recordFailedLogin,
  recordSuccessfulLogin,
  sessionUser,
  setUserActive,
  transferStock,
  updateRate,
  updateSettings,
} from "./database.js";
import { closePool, pool } from "./db.js";
import { newSessionToken, validatePassword, verifyPassword } from "./security.js";

/** Request context for audit logging (respects reverse proxies). */
function reqCtx(request) {
  const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return { ip: forwarded || request.socket.remoteAddress || "local", device: String(request.headers["user-agent"] || "").slice(0, 200) };
}

/** Generate a compliant temporary password for admin resets. */
function tempPassword() {
  return `Reset@${randomInt(100000, 999999)}xZ`;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const port = Number(process.env.PORT || 8787);
const secureCookie = process.env.NODE_ENV === "production" && process.env.JMD_HTTPS === "true";
const loginAttempts = new Map();

function json(response, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(payload), ...securityHeaders(), ...extraHeaders });
  response.end(payload);
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  };
}

function cookieMap(request) {
  return Object.fromEntries(String(request.headers.cookie || "").split(";").filter(Boolean).map((item) => {
    const [key, ...value] = item.trim().split("=");
    return [key, decodeURIComponent(value.join("="))];
  }));
}

function sessionCookie(token, maxAge) {
  return `jmd_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict${secureCookie ? "; Secure" : ""}${maxAge ? `; Max-Age=${maxAge}` : ""}`;
}

async function body(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1024 * 1024) throw new Error("Request is too large.");
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new Error("Invalid JSON request."); }
}

async function auth(request) {
  return sessionUser(cookieMap(request).jmd_session);
}

async function requireAuth(request, response, roles) {
  const user = await auth(request);
  if (!user) {
    json(response, 401, { error: "Please sign in." });
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    json(response, 403, { error: "You do not have permission for this action." });
    return null;
  }
  const pathname = new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname;
  if (user.mustChangePassword && !["/api/auth/me", "/api/auth/logout", "/api/auth/change-password"].includes(pathname)) {
    json(response, 403, { error: "Please change your temporary password before continuing." });
    return null;
  }
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && request.headers["x-csrf-token"] !== user.csrf) {
    json(response, 403, { error: "Security token expired. Refresh and try again." });
    return null;
  }
  return user;
}

/** Permission gate: assumes requireAuth already returned a user. Returns true if allowed. */
function requirePerm(user, response, permission) {
  if (Array.isArray(user.permissions) && user.permissions.includes(permission)) return true;
  json(response, 403, { error: "You do not have permission for this action." });
  return false;
}

function checkLoginLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (entry.reset < now) { entry.count = 0; entry.reset = now + 15 * 60 * 1000; }
  entry.count += 1;
  loginAttempts.set(ip, entry);
  return entry.count <= 12;
}

async function api(request, response, url) {
  if (request.method === "GET" && url.pathname === "/api/health") {
    try {
      await pool.query("SELECT 1");
      return json(response, 200, { ok: true });
    } catch {
      return json(response, 503, { ok: false, error: "Database unavailable." });
    }
  }

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const ip = request.socket.remoteAddress || "local";
    if (!checkLoginLimit(ip)) return json(response, 429, { error: "Too many login attempts. Try again in 15 minutes." });
    const input = await body(request);
    const tenant = await findTenantBySlug(input.tenant);
    const row = tenant ? await findUser(tenant.id, String(input.username || "").trim()) : null;
    const locked = row?.lockedUntil && new Date(row.lockedUntil) > new Date();
    if (!tenant || !row || !row.active || locked || !verifyPassword(String(input.password || ""), row.passwordSalt, row.passwordHash)) {
      if (row && !locked) await recordFailedLogin(row);
      return json(response, 401, { error: locked ? "Account temporarily locked. Try again later." : "Incorrect mill code, username or password." });
    }
    await recordSuccessfulLogin(row.id);
    const token = newSessionToken();
    await createSession(tenant.id, row.id, token, Boolean(input.remember), request.headers["user-agent"]);
    const user = await sessionUser(token); // fully-resolved (permissions, csrf, branch)
    await logAudit(user, { eventKind: "security", action: "login", entity: "user", entityId: user.username, description: `${user.displayName} signed in`, ctx: reqCtx(request) });
    return json(response, 200, { user, data: await getBootstrap(user) }, { "Set-Cookie": sessionCookie(token, input.remember ? 30 * 24 * 60 * 60 : null) });
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = await requireAuth(request, response);
    if (user) json(response, 200, { user, data: await getBootstrap(user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = cookieMap(request).jmd_session;
    const user = await requireAuth(request, response);
    if (!user) return;
    await deleteSession(token);
    return json(response, 200, { ok: true }, { "Set-Cookie": sessionCookie("", -1) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/change-password") {
    const user = await requireAuth(request, response);
    if (!user) return;
    const input = await body(request);
    if (!validatePassword(input.password)) return json(response, 400, { error: "Use at least 10 characters with uppercase, lowercase, number and symbol." });
    await changePassword(user, input.password, reqCtx(request));
    return json(response, 200, { ok: true }, { "Set-Cookie": sessionCookie("", -1) });
  }

  // Forgot password: mint a reset token (email-independent — returned for the owner to relay).
  if (request.method === "POST" && url.pathname === "/api/auth/forgot") {
    const ip = request.socket.remoteAddress || "local";
    if (!checkLoginLimit(ip)) return json(response, 429, { error: "Too many attempts. Try again later." });
    const input = await body(request);
    const tenant = await findTenantBySlug(input.tenant);
    const reset = tenant ? await createResetToken(tenant.id, String(input.username || "").trim()) : null;
    // Always return ok to avoid account enumeration; include token only when one was minted.
    return json(response, 200, { ok: true, ...(reset ? { token: reset.token, username: reset.username } : {}) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/reset") {
    const input = await body(request);
    const tenant = await findTenantBySlug(input.tenant);
    if (!tenant) return json(response, 400, { error: "Invalid reset request." });
    if (!validatePassword(input.password)) return json(response, 400, { error: "Use at least 10 characters with uppercase, lowercase, number and symbol." });
    await consumeResetToken(tenant.id, String(input.token || ""), input.password, reqCtx(request));
    return json(response, 200, { ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/bills") {
    const user = await requireAuth(request, response, ["admin", "biller"]);
    if (!user) return;
    if (!requirePerm(user, response, "bills.create")) return;
    const result = await createBill(user, await body(request), reqCtx(request));
    return json(response, 201, result);
  }

  const rateMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/rate$/);
  if (request.method === "PATCH" && rateMatch) {
    const user = await requireAuth(request, response, ["admin", "manager"]);
    if (!user) return;
    if (!requirePerm(user, response, "rates.edit")) return;
    const input = await body(request);
    return json(response, 200, { data: await updateRate(user, decodeURIComponent(rateMatch[1]), input.rate, reqCtx(request)) });
  }

  // ---- Settings ----
  if (url.pathname === "/api/settings" && request.method === "GET") {
    const user = await requireAuth(request, response);
    if (!user) return;
    if (!requirePerm(user, response, "settings.view")) return;
    return json(response, 200, { settings: await getSettings(user.tenantId) });
  }
  if (url.pathname === "/api/settings" && request.method === "PUT") {
    const user = await requireAuth(request, response);
    if (!user) return;
    if (!requirePerm(user, response, "settings.manage")) return;
    const settings = await updateSettings(user, await body(request), reqCtx(request));
    return json(response, 200, { settings });
  }

  // ---- Inventory operations ----
  if (url.pathname === "/api/inventory/adjust" && request.method === "POST") {
    const user = await requireAuth(request, response);
    if (!user) return;
    if (!requirePerm(user, response, "inventory.adjust")) return;
    return json(response, 200, { data: await adjustStock(user, await body(request), reqCtx(request)) });
  }
  if (url.pathname === "/api/inventory/transfer" && request.method === "POST") {
    const user = await requireAuth(request, response);
    if (!user) return;
    if (!requirePerm(user, response, "inventory.transfer")) return;
    return json(response, 200, { data: await transferStock(user, await body(request), reqCtx(request)) });
  }
  if (url.pathname === "/api/inventory/movements" && request.method === "GET") {
    const user = await requireAuth(request, response);
    if (!user) return;
    if (!requirePerm(user, response, "inventory.view")) return;
    return json(response, 200, { movements: await listStockMovements(user, { limit: url.searchParams.get("limit") }) });
  }

  // ---- Audit ----
  if (url.pathname === "/api/audit" && request.method === "GET") {
    const user = await requireAuth(request, response);
    if (!user) return;
    if (!requirePerm(user, response, "audit.view")) return;
    return json(response, 200, { audit: await listAudit(user, { limit: url.searchParams.get("limit") }) });
  }

  // ---- Users ----
  if (url.pathname === "/api/users" && request.method === "GET") {
    const user = await requireAuth(request, response);
    if (!user) return;
    if (!requirePerm(user, response, "users.view")) return;
    return json(response, 200, { users: await listUsers(user) });
  }
  if (url.pathname === "/api/users" && request.method === "POST") {
    const user = await requireAuth(request, response);
    if (!user) return;
    if (!requirePerm(user, response, "users.manage")) return;
    const input = await body(request);
    if (!validatePassword(input.password)) return json(response, 400, { error: "Temporary password must have 10+ characters, uppercase, lowercase, number and symbol." });
    await createUser(user, input, reqCtx(request));
    return json(response, 201, { users: await listUsers(user) });
  }
  const resetMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/reset-password$/);
  if (resetMatch && request.method === "POST") {
    const user = await requireAuth(request, response);
    if (!user) return;
    if (!requirePerm(user, response, "users.reset_password")) return;
    const temp = tempPassword();
    const result = await adminResetPassword(user, decodeURIComponent(resetMatch[1]), temp, reqCtx(request));
    return json(response, 200, { tempPassword: temp, username: result.username });
  }
  const activeMatch = url.pathname.match(/^\/api\/users\/([^/]+)\/active$/);
  if (activeMatch && request.method === "POST") {
    const user = await requireAuth(request, response);
    if (!user) return;
    if (!requirePerm(user, response, "users.manage")) return;
    const input = await body(request);
    return json(response, 200, { users: await setUserActive(user, decodeURIComponent(activeMatch[1]), Boolean(input.active), reqCtx(request)) });
  }

  json(response, 404, { error: "API route not found." });
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json", ".json": "application/json", ".woff2": "font/woff2" };

async function staticFile(response, pathname) {
  let filePath = path.join(dist, pathname === "/" ? "index.html" : pathname);
  if (!filePath.startsWith(dist)) return json(response, 403, { error: "Forbidden" });
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, "index.html");
  } catch {
    filePath = path.join(dist, "index.html");
  }
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream", "Content-Length": content.length, ...securityHeaders(), "Content-Security-Policy": "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; manifest-src 'self'" });
    response.end(content);
  } catch {
    json(response, 503, { error: "Client build not found. Run npm run build first." });
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) await api(request, response, url);
    else await staticFile(response, url.pathname);
  } catch (error) {
    // Postgres unique_violation is 23505; keep the legacy SQLite text match as a fallback.
    const conflict = error.code === "23505" || /unique constraint/i.test(error.message || "");
    const status = conflict ? 409 : 400;
    json(response, status, { error: conflict ? "That username, phone number or record already exists." : error.message || "Request failed." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`JMD Mill server running at http://localhost:${port}`);
  console.log(`Database: ${(process.env.DATABASE_URL || "").replace(/\/\/[^@]*@/, "//***@") || "not configured"}`);
});

async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  server.close();
  try {
    await closePool();
  } finally {
    process.exit(0);
  }
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
