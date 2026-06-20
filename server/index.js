import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  changePassword,
  createBill,
  createSession,
  createUser,
  databasePath,
  deleteSession,
  findUser,
  getBootstrap,
  listUsers,
  publicUser,
  recordFailedLogin,
  recordSuccessfulLogin,
  sessionUser,
  updateRate,
} from "./database.js";
import { newSessionToken, validatePassword, verifyPassword } from "./security.js";

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
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
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

function auth(request) {
  return sessionUser(cookieMap(request).jmd_session);
}

function requireAuth(request, response, roles) {
  const user = auth(request);
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

function checkLoginLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (entry.reset < now) { entry.count = 0; entry.reset = now + 15 * 60 * 1000; }
  entry.count += 1;
  loginAttempts.set(ip, entry);
  return entry.count <= 12;
}

async function api(request, response, url) {
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    const ip = request.socket.remoteAddress || "local";
    if (!checkLoginLimit(ip)) return json(response, 429, { error: "Too many login attempts. Try again in 15 minutes." });
    const input = await body(request);
    const row = findUser(String(input.username || "").trim());
    const locked = row?.locked_until && new Date(row.locked_until) > new Date();
    if (!row || !row.active || locked || !verifyPassword(String(input.password || ""), row.password_salt, row.password_hash)) {
      if (row && !locked) recordFailedLogin(row);
      return json(response, 401, { error: locked ? "Account temporarily locked. Try again later." : "Incorrect username or password." });
    }
    recordSuccessfulLogin(row.id);
    const token = newSessionToken();
    const session = createSession(row.id, token, Boolean(input.remember), request.headers["user-agent"]);
    const user = { ...publicUser(row), csrf: session.csrf };
    return json(response, 200, { user, data: getBootstrap(user) }, { "Set-Cookie": sessionCookie(token, input.remember ? 30 * 24 * 60 * 60 : null) });
  }

  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    const user = requireAuth(request, response);
    if (user) json(response, 200, { user, data: getBootstrap(user) });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = cookieMap(request).jmd_session;
    const user = requireAuth(request, response);
    if (!user) return;
    deleteSession(token);
    return json(response, 200, { ok: true }, { "Set-Cookie": sessionCookie("", -1) });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/change-password") {
    const user = requireAuth(request, response);
    if (!user) return;
    const input = await body(request);
    if (!validatePassword(input.password)) return json(response, 400, { error: "Use at least 10 characters with uppercase, lowercase, number and symbol." });
    changePassword(user.id, input.password);
    return json(response, 200, { ok: true }, { "Set-Cookie": sessionCookie("", -1) });
  }

  if (request.method === "POST" && url.pathname === "/api/bills") {
    const user = requireAuth(request, response, ["admin", "biller"]);
    if (!user) return;
    const result = createBill(user, await body(request));
    return json(response, 201, result);
  }

  const rateMatch = url.pathname.match(/^\/api\/products\/([^/]+)\/rate$/);
  if (request.method === "PATCH" && rateMatch) {
    const user = requireAuth(request, response, ["admin", "manager"]);
    if (!user) return;
    const input = await body(request);
    return json(response, 200, { data: updateRate(user, decodeURIComponent(rateMatch[1]), input.rate) });
  }

  if (url.pathname === "/api/users" && request.method === "GET") {
    const user = requireAuth(request, response, ["admin"]);
    if (user) json(response, 200, { users: listUsers(user) });
    return;
  }

  if (url.pathname === "/api/users" && request.method === "POST") {
    const user = requireAuth(request, response, ["admin"]);
    if (!user) return;
    const input = await body(request);
    if (!validatePassword(input.password)) return json(response, 400, { error: "Temporary password must have 10+ characters, uppercase, lowercase, number and symbol." });
    createUser(user, input);
    return json(response, 201, { users: listUsers(user) });
  }

  json(response, 404, { error: "API route not found." });
}

const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

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
    response.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream", "Content-Length": content.length, ...securityHeaders(), "Content-Security-Policy": "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'" });
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
    const status = /UNIQUE constraint/.test(error.message) ? 409 : 400;
    json(response, status, { error: status === 409 ? "That username, phone number or record already exists." : error.message || "Request failed." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`JMD Mill server running at http://localhost:${port}`);
  console.log(`Database: ${databasePath}`);
});
