import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { INITIAL_DATA } from "../src/data/seed.js";
import { hashPassword, newCsrfToken, normalizePhone, tokenHash } from "./security.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDirectory = process.env.JMD_DATA_DIR ? path.resolve(process.env.JMD_DATA_DIR) : path.join(root, "data");
mkdirSync(dataDirectory, { recursive: true });

export const databasePath = path.join(dataDirectory, "jmd-mill.sqlite");
export const db = new DatabaseSync(databasePath);
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;");

const schema = `
CREATE TABLE IF NOT EXISTS branches (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  invoice_prefix TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','manager','biller')),
  branch_id TEXT REFERENCES branches(id),
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  short_code TEXT NOT NULL,
  category TEXT NOT NULL,
  base_rate_paise INTEGER NOT NULL CHECK (base_rate_paise >= 0),
  stock_grams INTEGER NOT NULL DEFAULT 0 CHECK (stock_grams >= 0),
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS parties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone_normalized TEXT NOT NULL UNIQUE,
  phone_display TEXT NOT NULL,
  address TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('customer','supplier','both')),
  balance_paise INTEGER NOT NULL DEFAULT 0,
  balance_type TEXT NOT NULL DEFAULT 'debtor' CHECK (balance_type IN ('debtor','creditor')),
  bank_account_encrypted TEXT,
  bank_ifsc TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,
  bill_type TEXT NOT NULL CHECK (bill_type IN ('sale','purchase')),
  party_id TEXT NOT NULL REFERENCES parties(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  created_by INTEGER REFERENCES users(id),
  gross_paise INTEGER NOT NULL,
  deduction_paise INTEGER NOT NULL DEFAULT 0,
  net_paise INTEGER NOT NULL,
  paid_paise INTEGER NOT NULL DEFAULT 0,
  due_paise INTEGER NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS bill_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE RESTRICT,
  product_id TEXT NOT NULL REFERENCES products(id),
  entered_quantity REAL NOT NULL,
  entered_unit TEXT NOT NULL CHECK (entered_unit IN ('kg','quintal','tonne')),
  weight_grams INTEGER NOT NULL,
  rate_paise_per_kg INTEGER NOT NULL,
  base_rate_paise_per_kg INTEGER NOT NULL,
  amount_paise INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id TEXT NOT NULL REFERENCES bills(id),
  party_id TEXT NOT NULL REFERENCES parties(id),
  amount_paise INTEGER NOT NULL,
  method TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id TEXT REFERENCES bills(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  branch_id TEXT NOT NULL REFERENCES branches(id),
  quantity_grams INTEGER NOT NULL,
  movement_type TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bill_id TEXT REFERENCES bills(id),
  party_id TEXT NOT NULL REFERENCES parties(id),
  entry_type TEXT NOT NULL,
  amount_paise INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER REFERENCES users(id),
  event_kind TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON bills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_branch ON bills(branch_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_parties_name ON parties(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_stock_product_branch ON stock_movements(product_id, branch_id);
`;

db.exec(schema);

function seedDatabase() {
  const branchCount = db.prepare("SELECT COUNT(*) AS count FROM branches").get().count;
  if (branchCount === 0) {
    const insertBranch = db.prepare("INSERT INTO branches (id, name, invoice_prefix) VALUES (?, ?, ?)");
    insertBranch.run("AMARPUR", "Amarpur", "AMP");
    insertBranch.run("SAMUKHIYA", "Samukhiya", "SMK");
  }

  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount === 0) {
    const insertUser = db.prepare("INSERT INTO users (username, display_name, password_hash, password_salt, role, branch_id) VALUES (?, ?, ?, ?, ?, ?)");
    const accounts = [
      ["pankaj", "Pankaj Kumar Das", "JMD@9955299279", "admin", null],
      ["amarpur.biller", "Amarpur Biller", "Biller@2026", "biller", "AMARPUR"],
      ["samukhiya.biller", "Samukhiya Biller", "Biller@2026", "biller", "SAMUKHIYA"],
      ["manager", "Mill Manager", "Manager@2026", "manager", null],
    ];
    for (const [username, displayName, password, role, branchId] of accounts) {
      const credentials = hashPassword(password);
      insertUser.run(username, displayName, credentials.hash, credentials.salt, role, branchId);
    }
  }

  const productCount = db.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  if (productCount === 0) {
    const insertProduct = db.prepare("INSERT INTO products (id, name, short_code, category, base_rate_paise, stock_grams) VALUES (?, ?, ?, ?, ?, ?)");
    for (const item of INITIAL_DATA.products) {
      insertProduct.run(item.id, item.name, item.short, item.category, Math.round(item.baseRate * 100), Math.round(item.stockKg * 1000));
    }
  }

  const partyCount = db.prepare("SELECT COUNT(*) AS count FROM parties").get().count;
  if (partyCount === 0) {
    const insertParty = db.prepare("INSERT INTO parties (id, name, phone_normalized, phone_display, address, kind, balance_paise, balance_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const item of INITIAL_DATA.parties) {
      insertParty.run(item.id, item.name, normalizePhone(item.phone), item.phone, item.address, item.kind, Math.round(item.balance * 100), item.balanceType);
    }
  }

  const billCount = db.prepare("SELECT COUNT(*) AS count FROM bills").get().count;
  if (billCount === 0) {
    const insertBill = db.prepare("INSERT INTO bills (id, bill_type, party_id, branch_id, gross_paise, deduction_paise, net_paise, paid_paise, due_paise, payment_method, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    const insertLine = db.prepare("INSERT INTO bill_lines (bill_id, product_id, entered_quantity, entered_unit, weight_grams, rate_paise_per_kg, base_rate_paise_per_kg, amount_paise) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    for (const item of INITIAL_DATA.transactions) {
      const branchId = item.branch === "Main Mill" ? "AMARPUR" : "SAMUKHIYA";
      insertBill.run(item.id, item.type, item.partyId, branchId, Math.round(item.gross * 100), Math.round(item.cdDeduction * 100), Math.round(item.netAmount * 100), Math.round(item.paidAmount * 100), Math.round(item.dueAmount * 100), item.paymentMethod, item.date);
      insertLine.run(item.id, item.productId, item.quantity, item.unit, Math.round(item.totalKg * 1000), Math.round(item.rate * 100), Math.round(item.baseRate * 100), Math.round(item.gross * 100));
    }
  }

  const auditCount = db.prepare("SELECT COUNT(*) AS count FROM audit_events").get().count;
  if (auditCount === 0) {
    const insertAudit = db.prepare("INSERT INTO audit_events (event_kind, description, metadata, created_at) VALUES (?, ?, ?, ?)");
    for (const item of INITIAL_DATA.audits) insertAudit.run(item.kind, item.text, item.meta, item.date);
  }
}

seedDatabase();

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    branchId: row.branch_id,
    branch: row.branch_name || null,
    mustChangePassword: Boolean(row.must_change_password),
  };
}

export function findUser(username) {
  return db.prepare("SELECT u.*, b.name AS branch_name FROM users u LEFT JOIN branches b ON b.id = u.branch_id WHERE u.username = ? COLLATE NOCASE").get(username);
}

export function recordFailedLogin(user) {
  const attempts = Number(user.failed_attempts || 0) + 1;
  const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
  db.prepare("UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?").run(attempts >= 5 ? 0 : attempts, lockedUntil, user.id);
}

export function recordSuccessfulLogin(userId) {
  db.prepare("UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
}

export function createSession(userId, token, remember, userAgent) {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  const csrf = newCsrfToken();
  const expiresAt = Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000;
  db.prepare("INSERT INTO sessions (token_hash, user_id, csrf_token, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)").run(tokenHash(token), userId, csrf, expiresAt, String(userAgent || "").slice(0, 250));
  return { csrf, expiresAt };
}

export function sessionUser(token) {
  if (!token) return null;
  const row = db.prepare(`SELECT u.*, b.name AS branch_name, s.csrf_token, s.expires_at, s.id AS session_id
    FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN branches b ON b.id = u.branch_id
    WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1`).get(tokenHash(token), Date.now());
  if (!row) return null;
  return { ...publicUser(row), csrf: row.csrf_token, sessionId: row.session_id };
}

export function deleteSession(token) {
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash(token));
}

export function changePassword(userId, password) {
  const credentials = hashPassword(password);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?").run(credentials.hash, credentials.salt, userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    db.prepare("INSERT INTO audit_events (actor_user_id, event_kind, description) VALUES (?, 'security', 'Password changed')").run(userId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function mapProduct(row) {
  return { id: row.id, name: row.name, short: row.short_code, category: row.category, baseRate: row.base_rate_paise / 100, stockKg: row.stock_grams / 1000 };
}

function mapParty(row) {
  return { id: row.id, name: row.name, phone: row.phone_display, address: row.address, kind: row.kind, balance: row.balance_paise / 100, balanceType: row.balance_type };
}

function transactionRows(user) {
  const where = user.role === "biller" ? "WHERE b.branch_id = ?" : "";
  const params = user.role === "biller" ? [user.branchId] : [];
  return db.prepare(`SELECT b.*, p.name AS party_name, p.id AS party_code, pr.name AS product_name, pr.id AS product_code,
    bl.entered_quantity, bl.entered_unit, bl.weight_grams, bl.rate_paise_per_kg, bl.base_rate_paise_per_kg,
    br.name AS branch_name, COALESCE(u.display_name, 'Imported record') AS creator_name
    FROM bills b JOIN parties p ON p.id = b.party_id JOIN bill_lines bl ON bl.bill_id = b.id
    JOIN products pr ON pr.id = bl.product_id JOIN branches br ON br.id = b.branch_id
    LEFT JOIN users u ON u.id = b.created_by ${where} ORDER BY b.created_at DESC LIMIT 500`).all(...params);
}

function mapTransaction(row) {
  return {
    id: row.id, type: row.bill_type, date: row.created_at, partyId: row.party_code, party: row.party_name,
    productId: row.product_code, product: row.product_name, quantity: row.entered_quantity, unit: row.entered_unit,
    totalKg: row.weight_grams / 1000, rate: row.rate_paise_per_kg / 100, baseRate: row.base_rate_paise_per_kg / 100,
    gross: row.gross_paise / 100, cdDeduction: row.deduction_paise / 100, netAmount: row.net_paise / 100,
    paidAmount: row.paid_paise / 100, dueAmount: row.due_paise / 100, paymentMethod: row.payment_method,
    branch: row.branch_name, branchId: row.branch_id, createdBy: row.creator_name,
  };
}

export function getBootstrap(user) {
  const products = db.prepare("SELECT * FROM products WHERE active = 1 ORDER BY category, name").all().map(mapProduct);
  const parties = db.prepare("SELECT * FROM parties ORDER BY name COLLATE NOCASE").all().map(mapParty);
  const audits = db.prepare(`SELECT a.id, a.event_kind, a.description, a.metadata, a.created_at, u.display_name
    FROM audit_events a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.created_at DESC LIMIT 200`).all().map((row) => ({
    id: row.id, kind: row.event_kind, text: row.description, meta: row.metadata || row.display_name || "System", date: row.created_at,
  }));
  const branches = db.prepare("SELECT id, name FROM branches WHERE active = 1 ORDER BY name").all();
  return {
    user,
    products,
    parties,
    transactions: transactionRows(user).map(mapTransaction),
    audits,
    branches,
  };
}

function requireText(value, label, max = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be under ${max} characters.`);
  return text;
}

function nextPartyId() {
  const row = db.prepare("SELECT MAX(CAST(substr(id, 5) AS INTEGER)) AS value FROM parties WHERE id LIKE 'PTY-%'").get();
  return `PTY-${String(Number(row.value || 1000) + 1).padStart(4, "0")}`;
}

function nextBillId(type, branchId) {
  const prefix = type === "sale" ? "SAL" : "PUR";
  const branch = db.prepare("SELECT invoice_prefix FROM branches WHERE id = ?").get(branchId);
  const row = db.prepare("SELECT MAX(CAST(substr(id, -4) AS INTEGER)) AS value FROM bills WHERE id LIKE ?").get(`${prefix}-${branch.invoice_prefix}-%`);
  return `${prefix}-${branch.invoice_prefix}-${String(Number(row.value || 0) + 1).padStart(4, "0")}`;
}

export function createBill(user, payload) {
  if (!['admin', 'biller'].includes(user.role)) throw new Error("Your role cannot create bills.");
  const type = payload.type === "purchase" ? "purchase" : payload.type === "sale" ? "sale" : null;
  if (!type) throw new Error("Bill type is invalid.");
  const branchId = user.role === "biller" ? user.branchId : requireText(payload.branchId, "Office", 30);
  const branch = db.prepare("SELECT * FROM branches WHERE id = ? AND active = 1").get(branchId);
  if (!branch) throw new Error("Office is invalid.");
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND active = 1").get(payload.productId);
  if (!product) throw new Error("Product is invalid.");
  const unitMultipliers = { kg: 1000, quintal: 100000, tonne: 1000000 };
  const quantity = Number(payload.quantity);
  const multiplier = unitMultipliers[payload.unit];
  const ratePaise = Math.round(Number(payload.rate) * 100);
  if (!Number.isFinite(quantity) || quantity <= 0 || !multiplier) throw new Error("Quantity and unit are invalid.");
  if (!Number.isSafeInteger(ratePaise) || ratePaise <= 0) throw new Error("Rate is invalid.");
  const weightGrams = Math.round(quantity * multiplier);
  if (type === "sale" && product.stock_grams < weightGrams) throw new Error(`Insufficient stock. ${product.stock_grams / 1000} kg is available.`);
  const grossPaise = Math.round((weightGrams / 1000) * ratePaise);
  const deductionPaise = type === "purchase" && payload.applyCd && grossPaise > 2000000 ? Math.round(grossPaise * 0.025) : 0;
  const netPaise = grossPaise - deductionPaise;
  const paidPaise = Math.max(0, Math.min(netPaise, Math.round(Number(payload.paidAmount || 0) * 100)));
  const duePaise = netPaise - paidPaise;
  const partyInput = payload.party || {};
  const partyName = requireText(partyInput.name, "Party name", 100);
  const phoneDisplay = requireText(partyInput.phone, "Contact number", 30);
  const phoneNormalized = normalizePhone(phoneDisplay);
  if (phoneNormalized.length !== 10) throw new Error("Enter a valid 10-digit contact number.");
  const address = requireText(partyInput.address, "Address", 240);

  db.exec("BEGIN IMMEDIATE");
  try {
    let party = partyInput.id ? db.prepare("SELECT * FROM parties WHERE id = ?").get(partyInput.id) : null;
    if (!party) party = db.prepare("SELECT * FROM parties WHERE phone_normalized = ?").get(phoneNormalized);
    if (!party) {
      const partyId = nextPartyId();
      db.prepare("INSERT INTO parties (id, name, phone_normalized, phone_display, address, kind) VALUES (?, ?, ?, ?, ?, ?)").run(partyId, partyName, phoneNormalized, phoneDisplay, address, type === "sale" ? "customer" : "supplier");
      party = db.prepare("SELECT * FROM parties WHERE id = ?").get(partyId);
    } else {
      const kind = party.kind === (type === "sale" ? "supplier" : "customer") ? "both" : party.kind;
      db.prepare("UPDATE parties SET name = ?, phone_normalized = ?, phone_display = ?, address = ?, kind = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(partyName, phoneNormalized, phoneDisplay, address, kind, party.id);
    }

    const billId = nextBillId(type, branchId);
    db.prepare(`INSERT INTO bills (id, bill_type, party_id, branch_id, created_by, gross_paise, deduction_paise, net_paise, paid_paise, due_paise, payment_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(billId, type, party.id, branchId, user.id, grossPaise, deductionPaise, netPaise, paidPaise, duePaise, requireText(payload.paymentMethod, "Payment method", 40));
    db.prepare(`INSERT INTO bill_lines (bill_id, product_id, entered_quantity, entered_unit, weight_grams, rate_paise_per_kg, base_rate_paise_per_kg, amount_paise)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(billId, product.id, quantity, payload.unit, weightGrams, ratePaise, product.base_rate_paise, grossPaise);
    const movement = type === "purchase" ? weightGrams : -weightGrams;
    db.prepare("UPDATE products SET stock_grams = stock_grams + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(movement, product.id);
    db.prepare("INSERT INTO stock_movements (bill_id, product_id, branch_id, quantity_grams, movement_type) VALUES (?, ?, ?, ?, ?)").run(billId, product.id, branchId, movement, type);
    if (paidPaise > 0) db.prepare("INSERT INTO payments (bill_id, party_id, amount_paise, method) VALUES (?, ?, ?, ?)").run(billId, party.id, paidPaise, payload.paymentMethod);
    if (duePaise > 0) {
      const balanceType = type === "purchase" ? "creditor" : "debtor";
      db.prepare("UPDATE parties SET balance_paise = balance_paise + ?, balance_type = ? WHERE id = ?").run(duePaise, balanceType, party.id);
      db.prepare("INSERT INTO ledger_entries (bill_id, party_id, entry_type, amount_paise) VALUES (?, ?, ?, ?)").run(billId, party.id, balanceType, duePaise);
    }
    if (ratePaise !== product.base_rate_paise) {
      const text = `${product.name} rate changed from INR ${(product.base_rate_paise / 100).toFixed(2)} to INR ${(ratePaise / 100).toFixed(2)}`;
      db.prepare("INSERT INTO audit_events (actor_user_id, event_kind, description, metadata) VALUES (?, 'override', ?, ?)").run(user.id, text, `${partyName} · ${billId}`);
    }
    db.prepare("INSERT INTO audit_events (actor_user_id, event_kind, description, metadata) VALUES (?, 'bill', ?, ?)").run(user.id, `${type === "sale" ? "Sale" : "Purchase"} bill ${billId} posted`, `${partyName} · ${branch.name}`);
    db.exec("COMMIT");
    const freshUser = { ...user };
    const data = getBootstrap(freshUser);
    return { bill: data.transactions.find((item) => item.id === billId), data };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateRate(user, productId, rate) {
  if (!['admin', 'manager'].includes(user.role)) throw new Error("Only admins and managers can change base rates.");
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  const ratePaise = Math.round(Number(rate) * 100);
  if (!product || !Number.isSafeInteger(ratePaise) || ratePaise <= 0) throw new Error("Product or rate is invalid.");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE products SET base_rate_paise = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(ratePaise, productId);
    db.prepare("INSERT INTO audit_events (actor_user_id, event_kind, description, metadata) VALUES (?, 'base-rate', ?, ?)").run(user.id, `${product.name} base rate updated from INR ${(product.base_rate_paise / 100).toFixed(2)} to INR ${(ratePaise / 100).toFixed(2)}`, user.displayName);
    db.exec("COMMIT");
    return getBootstrap(user);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listUsers(user) {
  if (user.role !== "admin") throw new Error("Only admins can manage users.");
  return db.prepare(`SELECT u.id, u.username, u.display_name, u.role, u.active, u.must_change_password, u.last_login_at, b.name AS branch_name, u.branch_id
    FROM users u LEFT JOIN branches b ON b.id = u.branch_id ORDER BY u.created_at`).all().map((row) => ({
    id: row.id, username: row.username, displayName: row.display_name, role: row.role, active: Boolean(row.active), mustChangePassword: Boolean(row.must_change_password), lastLoginAt: row.last_login_at, branch: row.branch_name, branchId: row.branch_id,
  }));
}

export function createUser(actor, input) {
  if (actor.role !== "admin") throw new Error("Only admins can create users.");
  const username = requireText(input.username, "Username", 50).toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(username)) throw new Error("Username may contain letters, numbers, dots, dashes and underscores.");
  const displayName = requireText(input.displayName, "Display name", 100);
  const role = ['admin', 'manager', 'biller'].includes(input.role) ? input.role : null;
  if (!role) throw new Error("Role is invalid.");
  const branchId = role === "biller" ? requireText(input.branchId, "Office", 30) : null;
  const credentials = hashPassword(input.password);
  const result = db.prepare("INSERT INTO users (username, display_name, password_hash, password_salt, role, branch_id) VALUES (?, ?, ?, ?, ?, ?)").run(username, displayName, credentials.hash, credentials.salt, role, branchId);
  db.prepare("INSERT INTO audit_events (actor_user_id, event_kind, description, metadata) VALUES (?, 'security', ?, ?)").run(actor.id, `User ${username} created`, role);
  return result.lastInsertRowid;
}

export { publicUser };
