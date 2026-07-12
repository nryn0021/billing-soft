// Data-access layer, rewritten from raw SQLite onto Drizzle + PostgreSQL.
//
// Isolation contract: every read, write and update filters/stamps `tenant_id`,
// derived from the authenticated session user (`user.tenantId`). No query in this
// module touches another tenant's rows.
//
// Frontend contract: structural keys are UUIDs, but this layer always returns the
// readable identifiers (display_id / branch code) as `id`/`productId`/`partyId`/
// branch `id`, and accepts them on writes, so the React app is unchanged.
//
// Preserved from the original: integer paise / integer grams math, AES-256-GCM bank
// encryption, scrypt hashing, CSRF + hashed session tokens, and a single atomic
// transaction covering bill + lines + stock + payment + ledger + audit.
import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "./db.js";
import {
  appSettings,
  auditEvents,
  billCounters,
  billLines,
  bills,
  branches,
  ledgerEntries,
  parties,
  partyPayments,
  passwordResets,
  payments,
  products,
  sessions,
  stockMovements,
  tenants,
  transporters,
  users,
  vehicles,
} from "./schema.js";
import { decryptSensitive, encryptSensitive } from "./crypto.js";
import { hashPassword, newCsrfToken, newSessionToken, normalizePhone, tokenHash } from "./security.js";
import { PERMISSION_GROUPS, resolvePermissions } from "./permissions.js";
import { withDefaults } from "./settings.js";

// Enriched audit writer — records actor, action, entity, before/after and request context.
async function writeAudit(executor, entry) {
  await executor.insert(auditEvents).values({
    tenantId: entry.tenantId,
    actorUserId: entry.actorUserId ?? null,
    actorName: entry.actorName ?? null,
    eventKind: entry.eventKind,
    description: entry.description,
    metadata: entry.metadata ?? null,
    action: entry.action ?? null,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    oldValue: entry.oldValue == null ? null : String(entry.oldValue),
    newValue: entry.newValue == null ? null : String(entry.newValue),
    ipAddress: entry.ctx?.ip ?? null,
    device: entry.ctx?.device ?? null,
  });
}

/** Record an arbitrary audit event (login, exports, etc.) outside a transaction. */
export async function logAudit(user, entry) {
  await writeAudit(db, {
    tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName,
    eventKind: entry.eventKind || "event", action: entry.action, entity: entry.entity, entityId: entry.entityId,
    description: entry.description, metadata: entry.metadata, ctx: entry.ctx,
  });
}

// ---------------------------------------------------------------------------
// Settings (per-tenant JSON document)
// ---------------------------------------------------------------------------

export async function getSettings(tenantId) {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.tenantId, tenantId)).limit(1);
  return withDefaults(row?.data);
}

export async function updateSettings(user, patch, ctx) {
  // Reject a malformed CD rule at the source. The bill math also clamps defensively, but catching
  // it here gives the admin immediate feedback instead of silently falling back to defaults later.
  if (patch && patch.cd && typeof patch.cd === "object") {
    if (patch.cd.rate != null) {
      const r = Number(patch.cd.rate);
      if (!Number.isFinite(r) || r < 0 || r > 100) throw new Error("CD rate must be a number between 0 and 100.");
    }
    if (patch.cd.threshold != null) {
      const t = Number(patch.cd.threshold);
      if (!Number.isFinite(t) || t < 0) throw new Error("CD threshold must be a non-negative number.");
    }
  }
  const [existing] = await db.select().from(appSettings).where(eq(appSettings.tenantId, user.tenantId)).limit(1);
  const nextData = withDefaults({ ...(existing?.data || {}), ...patch });
  if (existing) {
    await db.update(appSettings).set({ data: nextData, updatedAt: new Date() }).where(eq(appSettings.tenantId, user.tenantId));
  } else {
    await db.insert(appSettings).values({ tenantId: user.tenantId, data: nextData });
  }
  await writeAudit(db, { tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "settings", action: "update", entity: "settings", entityId: Object.keys(patch).join(","), description: `Settings updated (${Object.keys(patch).join(", ")})`, ctx });
  return nextData;
}

async function tenantRolePermissions(tenantId) {
  const [row] = await db.select({ data: appSettings.data }).from(appSettings).where(eq(appSettings.tenantId, tenantId)).limit(1);
  return row?.data?.rolePermissions || {};
}

// ---------------------------------------------------------------------------
// Tenancy + identity
// ---------------------------------------------------------------------------

export async function findTenantBySlug(slug) {
  const value = String(slug || "").trim().toLowerCase();
  if (!value) return null;
  const [row] = await db
    .select()
    .from(tenants)
    .where(and(sql`lower(${tenants.slug}) = ${value}`, eq(tenants.active, true)))
    .limit(1);
  return row || null;
}

function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    branchId: row.branchCode || null, // readable branch code for the frontend
    branch: row.branchName || null,
    mustChangePassword: Boolean(row.mustChangePassword),
    tenantId: row.tenantId, // internal isolation key; the client ignores it
  };
}

export async function findUser(tenantId, username) {
  const value = String(username || "").trim();
  if (!tenantId || !value) return null;
  const [row] = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      username: users.username,
      displayName: users.displayName,
      passwordHash: users.passwordHash,
      passwordSalt: users.passwordSalt,
      role: users.role,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
      failedAttempts: users.failedAttempts,
      lockedUntil: users.lockedUntil,
      branchCode: branches.code,
      branchName: branches.name,
    })
    .from(users)
    .leftJoin(branches, eq(branches.id, users.branchId))
    .where(and(eq(users.tenantId, tenantId), sql`lower(${users.username}) = lower(${value})`))
    .limit(1);
  return row || null;
}

export async function recordFailedLogin(user) {
  const attempts = Number(user.failedAttempts || 0) + 1;
  const lockedUntil = attempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
  await db
    .update(users)
    .set({ failedAttempts: attempts >= 5 ? 0 : attempts, lockedUntil })
    .where(eq(users.id, user.id));
}

export async function recordSuccessfulLogin(userId) {
  await db
    .update(users)
    .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(users.id, userId));
}

export async function createSession(tenantId, userId, token, remember, userAgent) {
  await db.delete(sessions).where(lt(sessions.expiresAt, Date.now()));
  const csrf = newCsrfToken();
  const expiresAt = Date.now() + (remember ? 30 : 1) * 24 * 60 * 60 * 1000;
  await db.insert(sessions).values({
    tenantId,
    tokenHash: tokenHash(token),
    userId,
    csrfToken: csrf,
    expiresAt,
    userAgent: String(userAgent || "").slice(0, 250),
  });
  return { csrf, expiresAt };
}

export async function sessionUser(token) {
  if (!token) return null;
  const [row] = await db
    .select({
      id: users.id,
      tenantId: users.tenantId,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      mustChangePassword: users.mustChangePassword,
      branchCode: branches.code,
      branchName: branches.name,
      csrf: sessions.csrfToken,
      sessionId: sessions.id,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(branches, eq(branches.id, users.branchId))
    .where(and(eq(sessions.tokenHash, tokenHash(token)), gt(sessions.expiresAt, Date.now()), eq(users.active, true)))
    .limit(1);
  if (!row) return null;
  const overrides = await tenantRolePermissions(row.tenantId);
  const permissions = resolvePermissions(row.role, overrides);
  return { ...publicUser(row), permissions, csrf: row.csrf, sessionId: row.sessionId };
}

export async function deleteSession(token) {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash(token)));
}

export async function changePassword(user, password, ctx) {
  const credentials = hashPassword(password);
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash: credentials.hash, passwordSalt: credentials.salt, mustChangePassword: false })
      .where(and(eq(users.id, user.id), eq(users.tenantId, user.tenantId)));
    await tx.delete(sessions).where(eq(sessions.userId, user.id));
    await writeAudit(tx, { tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "security", action: "security", entity: "user", entityId: user.username, description: "Password changed", ctx });
  });
}

// ---------------------------------------------------------------------------
// Password reset (admin-initiated + token-based, email-independent)
// ---------------------------------------------------------------------------

/** Admin resets another user's password to a supplied temporary value. */
export async function adminResetPassword(actor, userId, tempPassword, ctx) {
  const [target] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.tenantId, actor.tenantId))).limit(1);
  if (!target) throw new Error("User not found.");
  const credentials = hashPassword(tempPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: credentials.hash, passwordSalt: credentials.salt, mustChangePassword: true, failedAttempts: 0, lockedUntil: null }).where(eq(users.id, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await writeAudit(tx, { tenantId: actor.tenantId, actorUserId: actor.id, actorName: actor.displayName, eventKind: "security", action: "security", entity: "user", entityId: target.username, description: `Password reset for ${target.username}`, ctx });
  });
  return { username: target.username };
}

/** Mint a reset token (returned once) the owner relays to the user out-of-band. */
export async function createResetToken(tenantId, username) {
  const user = await findUser(tenantId, username);
  if (!user) return null; // do not reveal whether the account exists
  const token = newSessionToken();
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
  await db.insert(passwordResets).values({ tenantId, userId: user.id, tokenHash: tokenHash(token), expiresAt });
  return { token, username: user.username };
}

export async function consumeResetToken(tenantId, token, newPassword, ctx) {
  const [row] = await db.select().from(passwordResets)
    .where(and(eq(passwordResets.tenantId, tenantId), eq(passwordResets.tokenHash, tokenHash(token)), gt(passwordResets.expiresAt, Date.now())))
    .limit(1);
  if (!row || row.usedAt) throw new Error("This reset link is invalid or has expired.");
  const credentials = hashPassword(newPassword);
  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash: credentials.hash, passwordSalt: credentials.salt, mustChangePassword: false, failedAttempts: 0, lockedUntil: null }).where(eq(users.id, row.userId));
    await tx.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, row.id));
    await tx.delete(sessions).where(eq(sessions.userId, row.userId));
    await writeAudit(tx, { tenantId, actorUserId: row.userId, eventKind: "security", action: "security", entity: "user", description: "Password reset via token", ctx });
  });
}

// ---------------------------------------------------------------------------
// Read models (mapped to the frontend shape with readable ids)
// ---------------------------------------------------------------------------

function mapProduct(row) {
  return {
    id: row.displayId,
    name: row.name,
    hindiName: row.hindiName || "",
    short: row.shortCode,
    category: row.category,
    baseRate: row.baseRatePaise / 100,
    stockKg: row.stockGrams / 1000,
  };
}

function mapParty(row) {
  return {
    id: row.displayId,
    name: row.name,
    phone: row.phoneDisplay,
    address: row.address,
    gstin: row.gstin || "",
    bankAccount: decryptSensitive(row.bankAccountEncrypted),
    bankIfsc: row.bankIfsc || "",
    kind: row.kind,
    balance: row.balancePaise / 100,
    balanceType: row.balanceType,
  };
}

function mapTransporter(row) {
  return { id: row.displayId, name: row.name, phone: row.phone || "" };
}

function mapVehicle(row) {
  return {
    id: row.displayId,
    vehicleNo: row.vehicleNo,
    ownerName: row.ownerName || "",
    ownerMob: row.ownerMob || "",
    driverName: row.driverName || "",
    driverMob: row.driverMob || "",
    dlNo: row.dlNo || "",
    aadhaar: decryptSensitive(row.aadhaarEncrypted),
  };
}

async function transactionRows(user) {
  const conditions = [eq(bills.tenantId, user.tenantId)];
  if (user.role === "biller") conditions.push(eq(branches.code, user.branchId));
  return db
    .select({
      id: bills.displayId,
      billType: bills.billType,
      createdAt: bills.createdAt,
      grossPaise: bills.grossPaise,
      deductionPaise: bills.deductionPaise,
      discountPaise: bills.discountPaise,
      netPaise: bills.netPaise,
      paidPaise: bills.paidPaise,
      duePaise: bills.duePaise,
      paymentMethod: bills.paymentMethod,
      meta: bills.meta,
      remarks: bills.remarks,
      branchId: bills.branchId,
      partyCode: parties.displayId,
      partyName: parties.name,
      partyPhone: parties.phoneDisplay,
      partyAddress: parties.address,
      partyGstin: parties.gstin,
      partyBankAccount: parties.bankAccountEncrypted,
      partyBankIfsc: parties.bankIfsc,
      productCode: products.displayId,
      productName: products.name,
      productHindi: products.hindiName,
      enteredQuantity: billLines.enteredQuantity,
      enteredUnit: billLines.enteredUnit,
      weightGrams: billLines.weightGrams,
      ratePaisePerKg: billLines.ratePaisePerKg,
      baseRatePaisePerKg: billLines.baseRatePaisePerKg,
      branchName: branches.name,
      branchCode: branches.code,
      creatorName: users.displayName,
    })
    .from(bills)
    .innerJoin(parties, eq(parties.id, bills.partyId))
    .innerJoin(billLines, eq(billLines.billId, bills.id))
    .innerJoin(products, eq(products.id, billLines.productId))
    .innerJoin(branches, eq(branches.id, bills.branchId))
    .leftJoin(users, eq(users.id, bills.createdBy))
    .where(and(...conditions))
    .orderBy(desc(bills.createdAt))
    .limit(500);
}

// Truck-sale document metadata: free-text logistics fields + informational money figures.
// Numeric sanity bounds. Money/weight columns are bigint(mode:'number') = JS double, so any
// figure above 2^53 loses integer precision silently. These caps keep every derived total well
// inside the safe-integer range while sitting far above any real grain transaction (₹10 crore
// per bill / 1000 tonne / ₹1 lakh per kg), so a fat-finger or a malformed client is rejected
// rather than storing a corrupt or approximate record.
const MAX_MONEY_PAISE = 100_000_000_00; // ₹10,00,00,000 (10 crore) per bill line
const MAX_WEIGHT_GRAMS = 1_000_000_000; // 1000 tonne
const MAX_RATE_PAISE = 10_000_000; // ₹1,00,000 per kg
const MAX_ADJ_PAISE = 100_000_000_00; // ₹10 crore per signed transport adjustment

// Core bill money (gross/net/paid/due) stays in the integer-paise columns; these auxiliary
// transport amounts are print-only and stored inside the JSON as integer paise too.
const TRUCK_META_STRINGS = [
  "buyerGstin", "hsnCode", "placeOfSupply", "invoiceNo", "challanNo",
  "transportName", "transportMob", "vehicleNo", "driverName", "driverMob", "ownerName", "ownerMob", "dlNo",
  "brokerName", "brokerMob",
];
const TRUCK_META_MONEY = ["loadingCharge", "bharaAdv", "bharaLess", "freight", "bhara", "advance", "toPay"];
// These three are SIGNED adjustments that change the Bill-of-Supply total: a negative
// value deducts. The rest (freight/bhara/advance/toPay) are print-only and stay > 0.
const TRUCK_META_SIGNED = new Set(["loadingCharge", "bharaAdv", "bharaLess"]);

function sanitizeTruckMeta(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = { kind: "truck" };
  for (const key of TRUCK_META_STRINGS) {
    const value = raw[key];
    if (value != null && String(value).trim()) out[key] = String(value).trim().slice(0, 120);
  }
  const bags = Number(raw.bags);
  if (Number.isFinite(bags) && bags > 0) out.bags = Math.round(bags);
  for (const key of TRUCK_META_MONEY) {
    const value = Number(raw[key]);
    // Drop non-finite AND out-of-range figures so a huge signed adjustment can't push the folded
    // net total past the safe-integer range (freight/bhara/etc. are print-only but capped too).
    if (!Number.isFinite(value) || Math.abs(Math.round(value * 100)) > MAX_ADJ_PAISE) continue;
    if (TRUCK_META_SIGNED.has(key)) { if (value !== 0) out[`${key}Paise`] = Math.round(value * 100); }
    else if (value > 0) out[`${key}Paise`] = Math.round(value * 100);
  }
  return out;
}

// A stable, unique key for a truck-owner party derived from the vehicle number. The parties
// table enforces a unique (tenant, phone_normalized) index, so real customers (10-digit phones)
// and truck owners (this "veh-…" key) never collide, and the SAME vehicle across trips resolves
// to the SAME owner party — so its freight payable accumulates instead of duplicating.
function ownerPartyKey(vehicleNo) {
  const v = String(vehicleNo || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return v ? `veh-${v}` : "";
}

// Convert stored paise fields back to rupees for the client/print layer.
function mapMeta(meta) {
  if (!meta || typeof meta !== "object") return null;
  const out = { ...meta };
  for (const key of TRUCK_META_MONEY) {
    if (out[`${key}Paise`] != null) { out[key] = out[`${key}Paise`] / 100; delete out[`${key}Paise`]; }
  }
  return out;
}

function mapTransaction(row) {
  return {
    id: row.id,
    type: row.billType,
    kind: row.meta?.kind || "standard",
    meta: mapMeta(row.meta),
    remarks: row.remarks || "",
    date: row.createdAt,
    partyId: row.partyCode,
    party: row.partyName,
    partyPhone: row.partyPhone,
    partyAddress: row.partyAddress,
    partyGstin: row.partyGstin || "",
    partyBankAccount: decryptSensitive(row.partyBankAccount),
    partyBankIfsc: row.partyBankIfsc || "",
    productId: row.productCode,
    product: row.productName,
    productHindi: row.productHindi || "",
    quantity: row.enteredQuantity,
    unit: row.enteredUnit,
    totalKg: row.weightGrams / 1000,
    rate: row.ratePaisePerKg / 100,
    baseRate: row.baseRatePaisePerKg / 100,
    gross: row.grossPaise / 100,
    cdDeduction: row.deductionPaise / 100,
    discount: row.discountPaise / 100,
    netAmount: row.netPaise / 100,
    paidAmount: row.paidPaise / 100,
    dueAmount: row.duePaise / 100,
    paymentMethod: row.paymentMethod,
    branch: row.branchName,
    branchId: row.branchCode,
    createdBy: row.creatorName || "Imported record",
  };
}

export async function getBootstrap(user) {
  const productRows = await db
    .select()
    .from(products)
    .where(and(eq(products.tenantId, user.tenantId), eq(products.active, true)))
    .orderBy(asc(products.category), sql`lower(${products.name})`);
  const partyRows = await db
    .select()
    .from(parties)
    .where(eq(parties.tenantId, user.tenantId))
    .orderBy(sql`lower(${parties.name})`);
  const auditRows = await db
    .select({
      id: auditEvents.id,
      kind: auditEvents.eventKind,
      text: auditEvents.description,
      metadata: auditEvents.metadata,
      createdAt: auditEvents.createdAt,
      displayName: users.displayName,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(eq(auditEvents.tenantId, user.tenantId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(200);
  const branchRows = await db
    .select({ id: branches.code, name: branches.name })
    .from(branches)
    .where(and(eq(branches.tenantId, user.tenantId), eq(branches.active, true)))
    .orderBy(asc(branches.name));
  const transporterRows = await db
    .select()
    .from(transporters)
    .where(eq(transporters.tenantId, user.tenantId))
    .orderBy(sql`lower(${transporters.name})`);
  const vehicleRows = await db
    .select()
    .from(vehicles)
    .where(eq(vehicles.tenantId, user.tenantId))
    .orderBy(sql`upper(${vehicles.vehicleNo})`);
  const transactions = (await transactionRows(user)).map(mapTransaction);
  const paymentRows = await db
    .select({
      id: partyPayments.id,
      partyCode: parties.displayId,
      direction: partyPayments.direction,
      amountPaise: partyPayments.amountPaise,
      method: partyPayments.method,
      note: partyPayments.note,
      createdAt: partyPayments.createdAt,
      by: users.displayName,
    })
    .from(partyPayments)
    .innerJoin(parties, eq(parties.id, partyPayments.partyId))
    .leftJoin(users, eq(users.id, partyPayments.createdBy))
    .where(eq(partyPayments.tenantId, user.tenantId))
    .orderBy(desc(partyPayments.createdAt))
    .limit(2000);
  const settings = await getSettings(user.tenantId);
  const serials = await countersFor(user.tenantId);
  return {
    user,
    products: productRows.map(mapProduct),
    parties: partyRows.map(mapParty),
    payments: paymentRows.map((p) => ({
      id: p.id,
      partyId: p.partyCode,
      direction: p.direction,
      amount: p.amountPaise / 100,
      method: p.method,
      note: p.note || "",
      date: p.createdAt,
      by: p.by || "—",
    })),
    transporters: transporterRows.map(mapTransporter),
    vehicles: vehicleRows.map(mapVehicle),
    serials,
    transactions,
    audits: auditRows.map((row) => ({
      id: row.id,
      kind: row.kind,
      text: row.text,
      meta: row.metadata || row.displayName || "System",
      date: row.createdAt,
    })),
    branches: branchRows,
    settings,
    permissionGroups: PERMISSION_GROUPS,
  };
}

// ---------------------------------------------------------------------------
// Validation helpers (unchanged business rules)
// ---------------------------------------------------------------------------

function requireText(value, label, max = 160) {
  const text = String(value || "").trim();
  if (!text || text.length > max) throw new Error(`${label} is required and must be under ${max} characters.`);
  return text;
}

function optionalText(value, label, max = 160) {
  const text = String(value || "").trim();
  if (text.length > max) throw new Error(`${label} must be under ${max} characters.`);
  return text;
}

function cleanBankAccount(value) {
  const text = optionalText(value, "Bank account number", 34).replace(/\s+/g, "");
  if (text && !/^[A-Za-z0-9]{6,34}$/.test(text)) throw new Error("Bank account number may contain 6-34 letters or digits.");
  return text;
}

function cleanIfsc(value) {
  const text = optionalText(value, "IFSC", 11).toUpperCase();
  if (text && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(text)) throw new Error("Enter a valid IFSC code.");
  return text;
}

function cleanGstin(value) {
  // Lenient: this runs on every bill post, so a mistyped/over-long GSTIN must NOT reject the
  // sale (do not route through the throwing optionalText). Only a well-formed 15-char GSTIN is
  // persisted to the party master; anything else is simply dropped.
  const text = String(value || "").trim().toUpperCase();
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]{2}$/.test(text) ? text : "";
}

function cleanAadhaar(value) {
  const text = optionalText(value, "Aadhaar", 14).replace(/\s+/g, "");
  if (text && !/^[0-9]{12}$/.test(text)) throw new Error("Aadhaar must be 12 digits.");
  return text;
}

async function nextPartyId(executor, tenantId) {
  const [row] = await executor
    .select({ value: sql`max(cast(substr(${parties.displayId}, 5) as integer))` })
    .from(parties)
    .where(and(eq(parties.tenantId, tenantId), sql`${parties.displayId} like 'PTY-%'`));
  return `PTY-${String(Number(row?.value || 1000) + 1).padStart(4, "0")}`;
}

async function nextBillId(executor, tenantId, type, branchCode) {
  const prefix = type === "sale" ? "SAL" : "PUR";
  const [branch] = await executor
    .select({ invoicePrefix: branches.invoicePrefix })
    .from(branches)
    .where(and(eq(branches.tenantId, tenantId), eq(branches.code, branchCode)))
    .limit(1);
  const pattern = `${prefix}-${branch.invoicePrefix}-%`;
  // Postgres substr() ignores negative offsets (unlike SQLite), so use right() for the last 4 digits.
  const [row] = await executor
    .select({ value: sql`max(cast(right(${bills.displayId}, 4) as integer))` })
    .from(bills)
    .where(and(eq(bills.tenantId, tenantId), sql`${bills.displayId} like ${pattern}`));
  return `${prefix}-${branch.invoicePrefix}-${String(Number(row?.value || 0) + 1).padStart(4, "0")}`;
}

// Atomically assign the next truck-document number (Bill-of-Supply invoice / challan).
// Runs inside the bill transaction: seed the counter row if missing, then bump-and-return
// under a row lock so concurrent posts can never collide. Admin can reset via updateCounters.
async function nextDocNumber(executor, tenantId, docType) {
  await executor
    .insert(billCounters)
    .values({ tenantId, docType, prefix: "", lastNumber: 0 })
    .onConflictDoNothing({ target: [billCounters.tenantId, billCounters.docType] });
  const [row] = await executor
    .update(billCounters)
    .set({ lastNumber: sql`${billCounters.lastNumber} + 1`, updatedAt: new Date() })
    .where(and(eq(billCounters.tenantId, tenantId), eq(billCounters.docType, docType)))
    .returning({ lastNumber: billCounters.lastNumber, prefix: billCounters.prefix });
  return `${row.prefix || ""}${Number(row.lastNumber)}`;
}

async function nextMasterId(executor, table, tenantId, prefix) {
  const [row] = await executor
    .select({ value: sql`max(cast(substr(${table.displayId}, 5) as integer))` })
    .from(table)
    .where(and(eq(table.tenantId, tenantId), sql`${table.displayId} like ${`${prefix}-%`}`));
  return `${prefix}-${String(Number(row?.value || 1000) + 1).padStart(4, "0")}`;
}

// Current serial config for the client (prefix + the NEXT number to be issued).
async function countersFor(tenantId) {
  const rows = await db.select().from(billCounters).where(eq(billCounters.tenantId, tenantId));
  const out = { invoice: { prefix: "", next: 1 }, challan: { prefix: "", next: 1 } };
  for (const r of rows) out[r.docType] = { prefix: r.prefix || "", next: Number(r.lastNumber) + 1 };
  return out;
}

// ---------------------------------------------------------------------------
// Bill posting (single atomic transaction)
// ---------------------------------------------------------------------------

export async function createBill(user, payload, ctx) {
  if (!["admin", "biller"].includes(user.role)) throw new Error("Your role cannot create bills.");
  const type = payload.type === "purchase" ? "purchase" : payload.type === "sale" ? "sale" : null;
  if (!type) throw new Error("Bill type is invalid.");
  const branchCode = user.role === "biller" ? user.branchId : requireText(payload.branchId, "Office", 30);

  const unitMultipliers = { kg: 1000, quintal: 100000, tonne: 1000000 };
  const quantity = Number(payload.quantity);
  const multiplier = unitMultipliers[payload.unit];
  const ratePaise = Math.round(Number(payload.rate) * 100);
  if (!Number.isFinite(quantity) || quantity <= 0 || !multiplier) throw new Error("Quantity and unit are invalid.");
  if (!Number.isSafeInteger(ratePaise) || ratePaise <= 0 || ratePaise > MAX_RATE_PAISE) throw new Error("Rate is invalid.");
  const weightGrams = Math.round(quantity * multiplier);
  const grossPaise = Math.round((weightGrams / 1000) * ratePaise);
  // A positive quantity that rounds down to zero grams (e.g. 0.0004 kg) would otherwise post a
  // real bill/stock movement/ledger row worth ₹0. Floor both derived figures so a sub-gram or
  // sub-paise entry is rejected rather than creating a phantom record.
  if (weightGrams <= 0) throw new Error("Quantity is too small to bill.");
  if (grossPaise <= 0) throw new Error("Bill amount is too small.");
  if (weightGrams > MAX_WEIGHT_GRAMS) throw new Error("Quantity is too large.");
  if (grossPaise > MAX_MONEY_PAISE) throw new Error("Bill amount is too large.");

  // Detailed "truck sale" bills (GST Bill of Supply + Challan) carry extra document data.
  // They are still ordinary sale bills for stock/ledger purposes — only the print output
  // differs. Built up-front so its three SIGNED adjustment figures (loading charge, bhara
  // advance, bhada less) can fold into the net total below (negative values deduct).
  const billMeta = payload.kind === "truck" && type === "sale" ? sanitizeTruckMeta(payload.meta) : null;
  const adjustmentsPaise = billMeta
    ? (billMeta.loadingChargePaise || 0) + (billMeta.bharaAdvPaise || 0) + (billMeta.bharaLessPaise || 0)
    : 0;

  // CD deduction rule is configurable in Settings, but still only applies when the
  // biller manually enables it (payload.applyCd) on a purchase bill. The deduction is
  // rounded UP to the next whole rupee (never fractional paise) per mill convention.
  const cd = (await getSettings(user.tenantId)).cd || {};
  // Settings are owner-editable, so a stored cd.rate/threshold of "abc", a negative, or an absurd
  // value must not poison the arithmetic. Coerce and clamp to a sane band; a non-finite rate would
  // otherwise make deduction → net → paid → due all NaN, which slips past every < / > guard below
  // (NaN comparisons are always false) and only fails at the Postgres INSERT with an opaque error.
  const cdThreshold = Number(cd.threshold);
  const cdRate = Number(cd.rate);
  const cdThresholdPaise = Math.round((Number.isFinite(cdThreshold) && cdThreshold >= 0 ? cdThreshold : 20000) * 100);
  const cdFactor = (Number.isFinite(cdRate) && cdRate >= 0 && cdRate <= 100 ? cdRate : 2.5) / 100;
  const deductionPaise = type === "purchase" && payload.applyCd && cd.enabled !== false && grossPaise > cdThresholdPaise
    ? Math.ceil((grossPaise * cdFactor) / 100) * 100
    : 0;
  // Optional manual discount entered by the operator (rupees). Cannot be negative and,
  // together with the CD deduction, cannot exceed the gross amount.
  const discountPaise = Math.round(Number(payload.discount || 0) * 100);
  if (!Number.isFinite(discountPaise) || discountPaise < 0) throw new Error("Discount amount is invalid.");
  const netPaise = grossPaise - deductionPaise - discountPaise + adjustmentsPaise;
  // netPaise must be a real, in-range integer: guard NaN/overflow explicitly since `< 0` alone
  // passes NaN and silently-imprecise values above 2^53.
  if (!Number.isSafeInteger(netPaise)) throw new Error("Bill amount is out of range.");
  if (netPaise < 0) throw new Error("Discount, deduction and charges cannot exceed the bill amount.");
  // Payment must be non-negative and cannot exceed the bill total — there is no advance/
  // credit facility, so genuine overpayment is rejected (not silently clamped) to keep the
  // recorded paid/due amounts consistent with what the operator entered. A 1-paise tolerance
  // absorbs floating-point rounding from the client's "pay full amount" helper.
  const rawPaidPaise = Math.round(Number(payload.paidAmount || 0) * 100);
  if (!Number.isFinite(rawPaidPaise) || rawPaidPaise < 0) throw new Error("Amount paid is invalid.");
  if (rawPaidPaise > netPaise + 1) throw new Error("Amount paid cannot exceed the bill total.");
  const paidPaise = Math.min(rawPaidPaise, netPaise);
  const duePaise = netPaise - paidPaise;

  const partyInput = payload.party || {};
  const partyName = requireText(partyInput.name, "Party name", 100);
  const phoneDisplay = requireText(partyInput.phone, "Contact number", 30);
  const phoneNormalized = normalizePhone(phoneDisplay);
  if (phoneNormalized.length !== 10) throw new Error("Enter a valid 10-digit contact number.");
  const address = requireText(partyInput.address, "Address", 240);
  const bankAccount = cleanBankAccount(partyInput.bankAccount);
  const bankIfsc = cleanIfsc(partyInput.bankIfsc);
  if ((bankAccount && !bankIfsc) || (!bankAccount && bankIfsc)) throw new Error("Enter both bank account number and IFSC, or leave both blank.");
  const encryptedBankAccount = encryptSensitive(bankAccount);
  const gstin = cleanGstin(partyInput.gstin);
  const remarks = optionalText(payload.remarks, "Remarks", 500);
  const paymentMethod = requireText(payload.paymentMethod, "Payment method", 40);

  let billDisplayId;
  await db.transaction(async (tx) => {
    const [branch] = await tx
      .select()
      .from(branches)
      .where(and(eq(branches.tenantId, user.tenantId), eq(branches.code, branchCode), eq(branches.active, true)))
      .limit(1);
    if (!branch) throw new Error("Office is invalid.");

    // Lock the product row so the stock check and decrement are concurrency-safe.
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, user.tenantId), eq(products.displayId, payload.productId), eq(products.active, true)))
      .limit(1)
      .for("update");
    if (!product) throw new Error("Product is invalid.");
    if (type === "sale" && product.stockGrams < weightGrams) throw new Error(`Insufficient stock. ${product.stockGrams / 1000} kg is available.`);

    let party = null;
    if (partyInput.id) {
      [party] = await tx
        .select()
        .from(parties)
        .where(and(eq(parties.tenantId, user.tenantId), eq(parties.displayId, partyInput.id)))
        .limit(1);
    }
    if (!party) {
      [party] = await tx
        .select()
        .from(parties)
        .where(and(eq(parties.tenantId, user.tenantId), eq(parties.phoneNormalized, phoneNormalized)))
        .limit(1);
    }
    if (!party) {
      const partyDisplayId = await nextPartyId(tx, user.tenantId);
      [party] = await tx
        .insert(parties)
        .values({
          tenantId: user.tenantId,
          displayId: partyDisplayId,
          name: partyName,
          phoneNormalized,
          phoneDisplay,
          address,
          kind: type === "sale" ? "customer" : "supplier",
          gstin: gstin || null,
          bankAccountEncrypted: encryptedBankAccount,
          bankIfsc: bankIfsc || null,
        })
        .returning();
    } else {
      const kind = party.kind === (type === "sale" ? "supplier" : "customer") ? "both" : party.kind;
      await tx
        .update(parties)
        .set({
          name: partyName,
          phoneNormalized,
          phoneDisplay,
          address,
          kind,
          // Never wipe a stored GSTIN when a bill is posted without one.
          gstin: gstin || party.gstin || null,
          bankAccountEncrypted: encryptedBankAccount,
          bankIfsc: bankIfsc || null,
          updatedAt: new Date(),
        })
        .where(and(eq(parties.id, party.id), eq(parties.tenantId, user.tenantId)));
    }

    billDisplayId = await nextBillId(tx, user.tenantId, type, branchCode);
    // Truck sales get auto-incrementing Bill-of-Supply + Challan numbers (assigned atomically
    // inside this transaction, overriding anything the client sent).
    let ownerParty = null;
    const freightPaise = billMeta ? (billMeta.toPayPaise || 0) : 0;
    if (billMeta) {
      billMeta.invoiceNo = await nextDocNumber(tx, user.tenantId, "invoice");
      billMeta.challanNo = await nextDocNumber(tx, user.tenantId, "challan");
      // Every truck bill starts life "dispatched" for the tracking board. The freight figures are
      // copied into tracking so the owner-payable ledger shows the full picture — total bhada,
      // advance already paid, and the "to pay" balance that is what the mill still OWES the driver.
      billMeta.tracking = {
        status: "dispatched", driverPaid: false, freightCleared: false,
        freightPaise,
        bharaPaise: billMeta.bharaPaise || 0,
        advancePaise: billMeta.advancePaise || 0,
      };
      // Book the freight "To Pay" as a payable to the truck owner, keyed by vehicle no.
      // The owner is a distinct party from the grain buyer: money the mill OWES (creditor).
      const ownerKey = ownerPartyKey(billMeta.vehicleNo);
      if (freightPaise > 0 && ownerKey) {
        // The party NAME is the vehicle number itself (e.g. MH12AB1234) — the owner appears in
        // Parties & Ledger exactly like any other creditor. The owner/driver name (if any) is kept
        // in the address for reference.
        const vehNo = String(billMeta.vehicleNo).toUpperCase();
        const ownerName = billMeta.ownerName || billMeta.transportName || "";
        const ownerAddress = `Truck freight · Vehicle ${vehNo}${ownerName ? ` · ${ownerName}` : ""}`.slice(0, 240);
        [ownerParty] = await tx.select().from(parties)
          .where(and(eq(parties.tenantId, user.tenantId), eq(parties.phoneNormalized, ownerKey))).limit(1);
        if (!ownerParty) {
          const ownerDisplayId = await nextPartyId(tx, user.tenantId);
          [ownerParty] = await tx.insert(parties).values({
            tenantId: user.tenantId,
            displayId: ownerDisplayId,
            name: vehNo,
            phoneNormalized: ownerKey,
            phoneDisplay: billMeta.ownerMob || billMeta.driverMob || vehNo,
            address: ownerAddress,
            kind: "supplier",
            balancePaise: 0,
            balanceType: "creditor",
          }).returning();
        } else if (ownerParty.name !== vehNo) {
          // Migrate parties created before this change (named "<owner> · <VEHNO>") to just the vehicle no.
          await tx.update(parties).set({ name: vehNo }).where(and(eq(parties.id, ownerParty.id), eq(parties.tenantId, user.tenantId)));
          ownerParty.name = vehNo;
        }
        billMeta.tracking.ownerParty = ownerParty.displayId;
        billMeta.tracking.ownerName = vehNo;
      }
    }
    const [bill] = await tx
      .insert(bills)
      .values({
        tenantId: user.tenantId,
        displayId: billDisplayId,
        billType: type,
        partyId: party.id,
        branchId: branch.id,
        createdBy: user.id,
        grossPaise,
        deductionPaise,
        discountPaise,
        netPaise,
        paidPaise,
        duePaise,
        paymentMethod,
        meta: billMeta,
        remarks: remarks || null,
      })
      .returning({ id: bills.id });

    await tx.insert(billLines).values({
      tenantId: user.tenantId,
      billId: bill.id,
      productId: product.id,
      enteredQuantity: quantity,
      enteredUnit: payload.unit,
      weightGrams,
      ratePaisePerKg: ratePaise,
      baseRatePaisePerKg: product.baseRatePaise,
      amountPaise: grossPaise,
    });

    const movement = type === "purchase" ? weightGrams : -weightGrams;
    await tx
      .update(products)
      .set({ stockGrams: sql`${products.stockGrams} + ${movement}`, updatedAt: new Date() })
      .where(and(eq(products.id, product.id), eq(products.tenantId, user.tenantId)));
    await tx.insert(stockMovements).values({
      tenantId: user.tenantId,
      billId: bill.id,
      productId: product.id,
      branchId: branch.id,
      quantityGrams: movement,
      balanceGrams: product.stockGrams + movement,
      movementType: type,
      actorUserId: user.id,
    });

    if (paidPaise > 0) {
      await tx.insert(payments).values({
        tenantId: user.tenantId,
        billId: bill.id,
        partyId: party.id,
        amountPaise: paidPaise,
        method: paymentMethod,
      });
    }

    if (duePaise > 0) {
      const balanceType = type === "purchase" ? "creditor" : "debtor";
      await tx
        .update(parties)
        .set({ balancePaise: sql`${parties.balancePaise} + ${duePaise}`, balanceType })
        .where(and(eq(parties.id, party.id), eq(parties.tenantId, user.tenantId)));
      await tx.insert(ledgerEntries).values({
        tenantId: user.tenantId,
        billId: bill.id,
        partyId: party.id,
        entryType: balanceType,
        amountPaise: duePaise,
      });
    }

    // Freight payable to the truck owner (tracked separately from the grain buyer's dues).
    if (ownerParty && freightPaise > 0) {
      await tx
        .update(parties)
        .set({ balancePaise: sql`${parties.balancePaise} + ${freightPaise}`, balanceType: "creditor" })
        .where(and(eq(parties.id, ownerParty.id), eq(parties.tenantId, user.tenantId)));
      await tx.insert(ledgerEntries).values({
        tenantId: user.tenantId,
        billId: bill.id,
        partyId: ownerParty.id,
        entryType: "creditor",
        amountPaise: freightPaise,
      });
    }

    if (ratePaise !== product.baseRatePaise) {
      await writeAudit(tx, {
        tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "override",
        action: "update", entity: "product", entityId: product.displayId,
        oldValue: (product.baseRatePaise / 100).toFixed(2), newValue: (ratePaise / 100).toFixed(2),
        description: `${product.name} rate changed from INR ${(product.baseRatePaise / 100).toFixed(2)} to INR ${(ratePaise / 100).toFixed(2)}`,
        metadata: `${partyName} · ${billDisplayId}`, ctx,
      });
    }
    await writeAudit(tx, {
      tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "bill",
      action: "create", entity: "bill", entityId: billDisplayId, newValue: (netPaise / 100).toFixed(2),
      description: `${type === "sale" ? "Sale" : "Purchase"} bill ${billDisplayId} posted`,
      metadata: `${partyName} · ${branch.name}`, ctx,
    });
  });

  const data = await getBootstrap(user);
  return { bill: data.transactions.find((item) => item.id === billDisplayId), data };
}

// ---------------------------------------------------------------------------
// Bill deletion (admin only) — fully reverses a posted bill.
//
// A posted bill has side effects across four tables: stock (product level + a
// stock_movements row), the party's outstanding due (balance + a ledger row),
// the truck owner's freight payable (balance + ledger row) and the recorded
// payment. Deleting must undo every one of them inside one transaction so stock
// and ledgers stay consistent — otherwise a "deleted" bill would leave phantom
// dues or a wrong stock count behind. Only an admin may do this.
// ---------------------------------------------------------------------------

export async function deleteBill(user, billDisplayId, ctx) {
  if (user.role !== "admin") throw new Error("Only an administrator can delete a bill.");
  await db.transaction(async (tx) => {
    const [bill] = await tx
      .select()
      .from(bills)
      .where(and(eq(bills.tenantId, user.tenantId), eq(bills.displayId, billDisplayId)))
      .limit(1)
      .for("update");
    if (!bill) throw new Error("Bill not found.");

    // 1) Reverse stock: a sale had removed grams (add them back); a purchase had added them (remove).
    const [line] = await tx.select().from(billLines).where(and(eq(billLines.tenantId, user.tenantId), eq(billLines.billId, bill.id))).limit(1);
    if (line) {
      const restore = bill.billType === "purchase" ? -line.weightGrams : line.weightGrams;
      const [product] = await tx.select().from(products).where(eq(products.id, line.productId)).limit(1).for("update");
      if (product) {
        const nextGrams = product.stockGrams + restore;
        if (nextGrams < 0) throw new Error("Cannot delete: it would make stock negative. Adjust stock first.");
        await tx.update(products).set({ stockGrams: nextGrams, updatedAt: new Date() }).where(eq(products.id, product.id));
      }
    }

    // 2) Reverse the grain party's outstanding due booked for this bill (clamped at zero).
    if (bill.duePaise > 0) {
      await tx.update(parties)
        .set({ balancePaise: sql`greatest(0, ${parties.balancePaise} - ${bill.duePaise})` })
        .where(and(eq(parties.tenantId, user.tenantId), eq(parties.id, bill.partyId)));
    }

    // 3) Reverse the truck owner's freight payable — but only if it was still outstanding
    //    (a driverPaid toggle already cleared it, so don't subtract twice).
    const tracking = bill.meta?.tracking;
    const freightPaise = Number(tracking?.freightPaise || 0);
    if (tracking?.ownerParty && freightPaise > 0 && !tracking.freightCleared) {
      await tx.update(parties)
        .set({ balancePaise: sql`greatest(0, ${parties.balancePaise} - ${freightPaise})` })
        .where(and(eq(parties.tenantId, user.tenantId), eq(parties.displayId, tracking.ownerParty)));
    }

    // 4) Remove dependent rows, then the bill itself (bill_lines has ON DELETE restrict).
    await tx.delete(ledgerEntries).where(and(eq(ledgerEntries.tenantId, user.tenantId), eq(ledgerEntries.billId, bill.id)));
    await tx.delete(payments).where(and(eq(payments.tenantId, user.tenantId), eq(payments.billId, bill.id)));
    await tx.delete(stockMovements).where(and(eq(stockMovements.tenantId, user.tenantId), eq(stockMovements.billId, bill.id)));
    await tx.delete(billLines).where(and(eq(billLines.tenantId, user.tenantId), eq(billLines.billId, bill.id)));
    await tx.delete(bills).where(and(eq(bills.tenantId, user.tenantId), eq(bills.id, bill.id)));

    await writeAudit(tx, {
      tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "bill",
      action: "delete", entity: "bill", entityId: billDisplayId, oldValue: (bill.netPaise / 100).toFixed(2),
      description: `${bill.billType === "sale" ? "Sale" : "Purchase"} bill ${billDisplayId} deleted`, ctx,
    });
  });
  return getBootstrap(user);
}

// ---------------------------------------------------------------------------
// Truck tracking — a live dispatch status kept inside the bill's JSON meta.
// Additive & migration-safe: `meta.tracking` sits alongside the truck document
// fields. The buyer's grain-payment ledger is NEVER touched here; the only ledger
// effect is settling the freight PAYABLE to the truck owner: toggling driverPaid
// clears (or restores) that owner-party creditor balance booked at bill creation.
// ---------------------------------------------------------------------------

const TRACK_STATES = ["dispatched", "on_the_way", "reached", "stuck", "empty", "complete"];

export async function updateBillTracking(user, billDisplayId, patch, ctx) {
  if (!["admin", "manager", "biller"].includes(user.role)) throw new Error("Your role cannot update tracking.");
  const status = TRACK_STATES.includes(patch?.status) ? patch.status : null;
  if (!status) throw new Error("Tracking status is invalid.");
  const place = optionalText(patch?.place, "Place note", 120);
  const note = optionalText(patch?.note, "Note", 240);
  const driverPaid = Boolean(patch?.driverPaid);

  await db.transaction(async (tx) => {
    const conditions = [eq(bills.tenantId, user.tenantId), eq(bills.displayId, billDisplayId)];
    const [bill] = await tx.select().from(bills).where(and(...conditions)).limit(1).for("update");
    if (!bill) throw new Error("Bill not found.");
    if (!bill.meta || bill.meta.kind !== "truck") throw new Error("Only truck bills can be tracked.");
    // Biller isolation: can only touch bills in their own branch.
    if (user.role === "biller") {
      const [branch] = await tx.select({ code: branches.code }).from(branches).where(eq(branches.id, bill.branchId)).limit(1);
      if (!branch || branch.code !== user.branchId) throw new Error("You can only update your branch's trucks.");
    }
    const prev = bill.meta.tracking || {};
    const freightPaise = Number(prev.freightPaise || 0);
    const wasCleared = Boolean(prev.freightCleared);
    // driverPaid only becomes meaningful once the truck is empty/complete; keep whatever was set otherwise.
    const nextPaid = status === "empty" || status === "complete" ? driverPaid : Boolean(prev.driverPaid);
    let freightCleared = wasCleared;

    // Settle / un-settle the owner's freight payable to match the driverPaid toggle.
    if (freightPaise > 0 && prev.ownerParty) {
      if (nextPaid && !wasCleared) {
        // Driver paid → reduce the owner's outstanding payable (clamped at zero).
        await tx.update(parties)
          .set({ balancePaise: sql`greatest(0, ${parties.balancePaise} - ${freightPaise})` })
          .where(and(eq(parties.tenantId, user.tenantId), eq(parties.displayId, prev.ownerParty)));
        freightCleared = true;
      } else if (!nextPaid && wasCleared) {
        // Toggled back to unpaid → restore the payable.
        await tx.update(parties)
          .set({ balancePaise: sql`${parties.balancePaise} + ${freightPaise}`, balanceType: "creditor" })
          .where(and(eq(parties.tenantId, user.tenantId), eq(parties.displayId, prev.ownerParty)));
        freightCleared = false;
      }
    }

    const tracking = {
      ...prev,
      status,
      place: place || prev.place || "",
      note: note || prev.note || "",
      driverPaid: nextPaid,
      freightCleared,
      updatedAt: new Date().toISOString(),
    };
    const nextMeta = { ...bill.meta, tracking };
    await tx.update(bills).set({ meta: nextMeta }).where(and(...conditions));
    await writeAudit(tx, {
      tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "tracking",
      action: "update", entity: "bill", entityId: billDisplayId, newValue: status,
      description: `Truck ${bill.meta.vehicleNo || billDisplayId} → ${status.replace(/_/g, " ")}${nextPaid !== Boolean(prev.driverPaid) ? (nextPaid ? " · driver paid" : " · driver unpaid") : ""}`,
      metadata: bill.meta.placeOfSupply || "", ctx,
    });
  });
  return getBootstrap(user);
}

// Payment methods accepted for a standalone party settlement. "Credit" is deliberately absent —
// a payment is money that actually moved, never a deferral.
const PAYMENT_METHODS = new Set(["Cash", "Online / Bank", "UPI", "Cheque", "Other"]);

// Record a receipt from / payment to a party against its running balance. Works for any party:
// money IN from a debtor customer, money OUT to a creditor supplier, or freight (bhada) OUT to a
// truck-owner party keyed by vehicle no. Overpayment is REJECTED (not clamped), the balance can
// only move toward zero, and it all happens inside one row-locked transaction. Billers allowed.
export async function recordPartyPayment(user, partyDisplayId, input, ctx) {
  if (!["admin", "manager", "biller"].includes(user.role)) throw new Error("Your role cannot record payments.");
  const amountPaise = Math.round(Number(input?.amount) * 100);
  if (!Number.isFinite(amountPaise) || amountPaise <= 0) throw new Error("Enter a payment amount greater than zero.");
  if (amountPaise > MAX_MONEY_PAISE) throw new Error("That payment amount is too large.");
  const method = PAYMENT_METHODS.has(input?.method) ? input.method : "Cash";
  const note = optionalText(input?.note, "Note", 240);

  let direction = "out";
  await db.transaction(async (tx) => {
    const [party] = await tx
      .select()
      .from(parties)
      .where(and(eq(parties.tenantId, user.tenantId), eq(parties.displayId, partyDisplayId)))
      .limit(1)
      .for("update");
    if (!party) throw new Error("Party not found.");
    if (party.balancePaise <= 0) throw new Error("This party has no outstanding balance to settle.");
    // Reject overpayment outright — the running balance may only move toward zero.
    if (amountPaise > party.balancePaise) throw new Error("Payment exceeds the outstanding balance. Enter an amount up to the amount due.");
    // A debtor owes the mill → this is money RECEIVED (in); a creditor is owed BY the mill → money PAID (out).
    direction = party.balanceType === "debtor" ? "in" : "out";

    await tx
      .update(parties)
      .set({ balancePaise: sql`${parties.balancePaise} - ${amountPaise}`, updatedAt: new Date() })
      .where(and(eq(parties.id, party.id), eq(parties.tenantId, user.tenantId)));
    await tx.insert(partyPayments).values({
      tenantId: user.tenantId,
      partyId: party.id,
      direction,
      amountPaise,
      method,
      note: note || null,
      createdBy: user.id,
    });
    // Mirror it into the ledger so the double-entry view stays complete (opposite side of the due).
    await tx.insert(ledgerEntries).values({
      tenantId: user.tenantId,
      billId: null,
      partyId: party.id,
      entryType: direction === "in" ? "creditor" : "debtor",
      amountPaise,
    });
    await writeAudit(tx, {
      tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "payment",
      action: "payment", entity: "party", entityId: partyDisplayId, newValue: String(amountPaise),
      description: `${direction === "in" ? "Received" : "Paid"} ₹${(amountPaise / 100).toLocaleString("en-IN")} ${direction === "in" ? "from" : "to"} ${party.name} (${method})`,
      metadata: note || "", ctx,
    });
  });
  return getBootstrap(user);
}

// ---------------------------------------------------------------------------
// Tally import — bring existing party ledgers in from a Tally masters XML export.
// Parties are matched by normalized phone (falling back to case-insensitive name) so
// re-importing is idempotent: an existing party is updated in place, never duplicated.
// Opening balances become the party's outstanding dues (debtor/creditor). No bills are
// fabricated (see server/tally.js for why), so stock and the rate book are untouched.
// ---------------------------------------------------------------------------

export async function importTallyParties(user, ledgers, ctx) {
  if (!["admin", "manager"].includes(user.role)) throw new Error("Only admins and managers can import Tally data.");
  const list = Array.isArray(ledgers) ? ledgers.slice(0, 20000) : [];
  if (!list.length) throw new Error("No party ledgers found in that Tally file.");
  let created = 0, updated = 0, skipped = 0;

  await db.transaction(async (tx) => {
    for (const raw of list) {
      const name = String(raw?.name || "").trim().slice(0, 100);
      if (!name) { skipped++; continue; }
      const phoneDisplay = String(raw?.phone || "").trim().slice(0, 30);
      const phoneNormalized = normalizePhone(phoneDisplay);
      const address = String(raw?.address || "").trim().slice(0, 240) || "Imported from Tally";
      const gstin = cleanGstin(raw?.gstin);
      const kind = raw?.kind === "supplier" ? "supplier" : "customer";
      const balanceRupees = Number(raw?.openingBalance);
      const balancePaise = Number.isFinite(balanceRupees) ? Math.max(0, Math.round(Math.abs(balanceRupees) * 100)) : 0;
      const balanceType = kind === "supplier" ? "creditor" : "debtor";

      // Match by phone first (the app's natural key), then by name.
      let existing = null;
      if (phoneNormalized.length === 10) {
        [existing] = await tx.select().from(parties).where(and(eq(parties.tenantId, user.tenantId), eq(parties.phoneNormalized, phoneNormalized))).limit(1);
      }
      if (!existing) {
        [existing] = await tx.select().from(parties).where(and(eq(parties.tenantId, user.tenantId), sql`lower(${parties.name}) = lower(${name})`)).limit(1);
      }
      if (existing) {
        await tx.update(parties).set({
          name,
          address: existing.address || address,
          gstin: gstin || existing.gstin || null,
          kind: existing.kind !== kind && existing.kind !== "both" ? "both" : existing.kind,
          updatedAt: new Date(),
        }).where(and(eq(parties.id, existing.id), eq(parties.tenantId, user.tenantId)));
        updated++;
      } else {
        // A synthetic phone keeps the NOT-NULL/display columns valid when Tally has none.
        const phN = phoneNormalized.length === 10 ? phoneNormalized : "";
        const displayId = await nextPartyId(tx, user.tenantId);
        await tx.insert(parties).values({
          tenantId: user.tenantId,
          displayId,
          name,
          phoneNormalized: phN,
          phoneDisplay: phoneDisplay || "—",
          address,
          kind,
          gstin: gstin || null,
          balancePaise,
          balanceType,
        });
        created++;
      }
    }
    await writeAudit(tx, {
      tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "tally",
      action: "import", entity: "party", entityId: "tally", newValue: String(created + updated),
      description: `Tally import: ${created} added, ${updated} updated, ${skipped} skipped`, ctx,
    });
  });

  const data = await getBootstrap(user);
  return { summary: { created, updated, skipped, total: list.length }, data };
}

export async function updateRate(user, productId, rate, ctx) {
  if (!["admin", "manager"].includes(user.role)) throw new Error("Only admins and managers can change base rates.");
  const ratePaise = Math.round(Number(rate) * 100);
  if (!Number.isSafeInteger(ratePaise) || ratePaise <= 0) throw new Error("Product or rate is invalid.");
  await db.transaction(async (tx) => {
    const [product] = await tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, user.tenantId), eq(products.displayId, productId)))
      .limit(1)
      .for("update");
    if (!product) throw new Error("Product or rate is invalid.");
    await tx
      .update(products)
      .set({ baseRatePaise: ratePaise, updatedAt: new Date() })
      .where(and(eq(products.id, product.id), eq(products.tenantId, user.tenantId)));
    await writeAudit(tx, {
      tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "base-rate",
      action: "update", entity: "product", entityId: product.displayId,
      oldValue: (product.baseRatePaise / 100).toFixed(2), newValue: (ratePaise / 100).toFixed(2),
      description: `${product.name} base rate updated from INR ${(product.baseRatePaise / 100).toFixed(2)} to INR ${(ratePaise / 100).toFixed(2)}`,
      metadata: user.displayName, ctx,
    });
  });
  return getBootstrap(user);
}

// ---------------------------------------------------------------------------
// Inventory operations (adjustments, transfers, movement history)
// ---------------------------------------------------------------------------

/** Adjust a product's stock by a signed number of kilograms. Negative stock is blocked. */
export async function adjustStock(user, payload, ctx) {
  if (!["admin", "manager"].includes(user.role)) throw new Error("Only admins and managers can adjust stock.");
  const deltaGrams = Math.round(Number(payload.deltaKg) * 1000);
  if (!Number.isFinite(deltaGrams) || deltaGrams === 0) throw new Error("Enter a non-zero adjustment quantity.");
  const note = optionalText(payload.note, "Note", 240);
  const branchCode = requireText(payload.branchId, "Branch", 30);
  await db.transaction(async (tx) => {
    const [branch] = await tx.select().from(branches).where(and(eq(branches.tenantId, user.tenantId), eq(branches.code, branchCode))).limit(1);
    if (!branch) throw new Error("Branch is invalid.");
    const [product] = await tx.select().from(products).where(and(eq(products.tenantId, user.tenantId), eq(products.displayId, payload.productId))).limit(1).for("update");
    if (!product) throw new Error("Product is invalid.");
    const nextGrams = product.stockGrams + deltaGrams;
    if (nextGrams < 0) throw new Error(`Adjustment would make stock negative. ${product.stockGrams / 1000} kg available.`);
    await tx.update(products).set({ stockGrams: nextGrams, updatedAt: new Date() }).where(eq(products.id, product.id));
    await tx.insert(stockMovements).values({
      tenantId: user.tenantId, productId: product.id, branchId: branch.id, quantityGrams: deltaGrams,
      balanceGrams: nextGrams, movementType: "adjustment", note: note || null, actorUserId: user.id,
    });
    await writeAudit(tx, {
      tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "inventory",
      action: "update", entity: "product", entityId: product.displayId,
      oldValue: `${product.stockGrams / 1000} kg`, newValue: `${nextGrams / 1000} kg`,
      description: `Stock adjusted for ${product.name} by ${deltaGrams / 1000} kg${note ? ` — ${note}` : ""}`,
      metadata: branch.name, ctx,
    });
  });
  return getBootstrap(user);
}

/** Record a stock transfer between two branches (attribution movements). */
export async function transferStock(user, payload, ctx) {
  if (!["admin", "manager"].includes(user.role)) throw new Error("Only admins and managers can transfer stock.");
  const qtyGrams = Math.round(Number(payload.qtyKg) * 1000);
  if (!Number.isFinite(qtyGrams) || qtyGrams <= 0) throw new Error("Enter a valid transfer quantity.");
  const note = optionalText(payload.note, "Note", 240);
  const fromCode = requireText(payload.fromBranchId, "Source branch", 30);
  const toCode = requireText(payload.toBranchId, "Destination branch", 30);
  if (fromCode === toCode) throw new Error("Source and destination branches must differ.");
  await db.transaction(async (tx) => {
    const [from] = await tx.select().from(branches).where(and(eq(branches.tenantId, user.tenantId), eq(branches.code, fromCode))).limit(1);
    const [to] = await tx.select().from(branches).where(and(eq(branches.tenantId, user.tenantId), eq(branches.code, toCode))).limit(1);
    if (!from || !to) throw new Error("Branch is invalid.");
    const [product] = await tx.select().from(products).where(and(eq(products.tenantId, user.tenantId), eq(products.displayId, payload.productId))).limit(1);
    if (!product) throw new Error("Product is invalid.");
    await tx.insert(stockMovements).values([
      { tenantId: user.tenantId, productId: product.id, branchId: from.id, quantityGrams: -qtyGrams, balanceGrams: product.stockGrams, movementType: "transfer-out", note: note || null, actorUserId: user.id },
      { tenantId: user.tenantId, productId: product.id, branchId: to.id, quantityGrams: qtyGrams, balanceGrams: product.stockGrams, movementType: "transfer-in", note: note || null, actorUserId: user.id },
    ]);
    await writeAudit(tx, {
      tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "inventory",
      action: "transfer", entity: "product", entityId: product.displayId,
      description: `Transferred ${qtyGrams / 1000} kg of ${product.name} from ${from.name} to ${to.name}${note ? ` — ${note}` : ""}`,
      metadata: `${from.name} → ${to.name}`, ctx,
    });
  });
  return getBootstrap(user);
}

export async function listStockMovements(user, filters = {}) {
  const conditions = [eq(stockMovements.tenantId, user.tenantId)];
  const rows = await db
    .select({
      id: stockMovements.id, createdAt: stockMovements.createdAt, quantityGrams: stockMovements.quantityGrams,
      balanceGrams: stockMovements.balanceGrams, movementType: stockMovements.movementType, note: stockMovements.note,
      productName: products.name, productCode: products.displayId, branchName: branches.name, billId: bills.displayId, actor: users.displayName,
    })
    .from(stockMovements)
    .innerJoin(products, eq(products.id, stockMovements.productId))
    .leftJoin(branches, eq(branches.id, stockMovements.branchId))
    .leftJoin(bills, eq(bills.id, stockMovements.billId))
    .leftJoin(users, eq(users.id, stockMovements.actorUserId))
    .where(and(...conditions))
    .orderBy(desc(stockMovements.createdAt))
    .limit(Number(filters.limit) || 500);
  return rows.map((r) => ({
    id: r.id, date: r.createdAt, type: r.movementType, quantityKg: r.quantityGrams / 1000,
    balanceKg: r.balanceGrams == null ? null : r.balanceGrams / 1000, note: r.note || "",
    product: r.productName, productId: r.productCode, branch: r.branchName || "—", bill: r.billId || "", actor: r.actor || "System",
  }));
}

export async function listAudit(user, filters = {}) {
  const rows = await db
    .select({
      id: auditEvents.id, createdAt: auditEvents.createdAt, kind: auditEvents.eventKind, action: auditEvents.action,
      entity: auditEvents.entity, entityId: auditEvents.entityId, description: auditEvents.description,
      oldValue: auditEvents.oldValue, newValue: auditEvents.newValue, metadata: auditEvents.metadata,
      ip: auditEvents.ipAddress, device: auditEvents.device, actorName: auditEvents.actorName, displayName: users.displayName,
    })
    .from(auditEvents)
    .leftJoin(users, eq(users.id, auditEvents.actorUserId))
    .where(eq(auditEvents.tenantId, user.tenantId))
    .orderBy(desc(auditEvents.createdAt))
    .limit(Number(filters.limit) || 500);
  return rows.map((r) => ({
    id: r.id, date: r.createdAt, kind: r.kind, action: r.action || r.kind, entity: r.entity || "", entityId: r.entityId || "",
    text: r.description, oldValue: r.oldValue || "", newValue: r.newValue || "", meta: r.metadata || "",
    ip: r.ip || "", device: r.device || "", actor: r.actorName || r.displayName || "System",
  }));
}

// ---------------------------------------------------------------------------
// User administration
// ---------------------------------------------------------------------------

export async function listUsers(user) {
  if (user.role !== "admin") throw new Error("Only admins can manage users.");
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      active: users.active,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      branchName: branches.name,
      branchCode: branches.code,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(branches, eq(branches.id, users.branchId))
    .where(eq(users.tenantId, user.tenantId))
    .orderBy(asc(users.createdAt));
  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    active: Boolean(row.active),
    mustChangePassword: Boolean(row.mustChangePassword),
    lastLoginAt: row.lastLoginAt,
    branch: row.branchName,
    branchId: row.branchCode,
  }));
}

export async function createUser(actor, input, ctx) {
  if (actor.role !== "admin") throw new Error("Only admins can create users.");
  const username = requireText(input.username, "Username", 50).toLowerCase();
  if (!/^[a-z0-9._-]+$/.test(username)) throw new Error("Username may contain letters, numbers, dots, dashes and underscores.");
  const displayName = requireText(input.displayName, "Display name", 100);
  const role = ["admin", "manager", "biller"].includes(input.role) ? input.role : null;
  if (!role) throw new Error("Role is invalid.");
  let branchId = null;
  if (role === "biller") {
    const branchCode = requireText(input.branchId, "Office", 30);
    const [branch] = await db
      .select({ id: branches.id })
      .from(branches)
      .where(and(eq(branches.tenantId, actor.tenantId), eq(branches.code, branchCode)))
      .limit(1);
    if (!branch) throw new Error("Office is invalid.");
    branchId = branch.id;
  }
  const credentials = hashPassword(input.password);
  const [created] = await db
    .insert(users)
    .values({
      tenantId: actor.tenantId,
      username,
      displayName,
      passwordHash: credentials.hash,
      passwordSalt: credentials.salt,
      role,
      branchId,
    })
    .returning({ id: users.id });
  await writeAudit(db, {
    tenantId: actor.tenantId, actorUserId: actor.id, actorName: actor.displayName, eventKind: "security",
    action: "create", entity: "user", entityId: username, newValue: role,
    description: `User ${username} created`, metadata: role, ctx,
  });
  return created.id;
}

export async function setUserActive(actor, userId, active, ctx) {
  if (actor.role !== "admin") throw new Error("Only admins can manage users.");
  const [target] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.tenantId, actor.tenantId))).limit(1);
  if (!target) throw new Error("User not found.");
  if (target.id === actor.id) throw new Error("You cannot deactivate your own account.");
  await db.update(users).set({ active: Boolean(active) }).where(eq(users.id, userId));
  if (!active) await db.delete(sessions).where(eq(sessions.userId, userId));
  await writeAudit(db, {
    tenantId: actor.tenantId, actorUserId: actor.id, actorName: actor.displayName, eventKind: "security",
    action: "update", entity: "user", entityId: target.username, newValue: active ? "active" : "inactive",
    description: `User ${target.username} ${active ? "activated" : "deactivated"}`, ctx,
  });
  return listUsers(actor);
}

// ---------------------------------------------------------------------------
// Truck-sale master data (transporters, vehicles) + document serial counters
// ---------------------------------------------------------------------------

export async function createTransporter(user, input, ctx) {
  const name = requireText(input.name, "Transporter name", 120);
  const phone = optionalText(input.phone, "Phone", 20);
  const displayId = await nextMasterId(db, transporters, user.tenantId, "TRP");
  await db.insert(transporters).values({ tenantId: user.tenantId, displayId, name, phone: phone || null });
  await writeAudit(db, {
    tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "master",
    action: "create", entity: "transporter", entityId: displayId, description: `Transporter ${name} added`, ctx,
  });
  return getBootstrap(user);
}

export async function updateTransporter(user, id, input, ctx) {
  const name = requireText(input.name, "Transporter name", 120);
  const phone = optionalText(input.phone, "Phone", 20);
  const result = await db
    .update(transporters)
    .set({ name, phone: phone || null, updatedAt: new Date() })
    .where(and(eq(transporters.tenantId, user.tenantId), eq(transporters.displayId, id)))
    .returning({ id: transporters.id });
  if (!result.length) throw new Error("Transporter not found.");
  await writeAudit(db, {
    tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "master",
    action: "update", entity: "transporter", entityId: id, description: `Transporter ${name} updated`, ctx,
  });
  return getBootstrap(user);
}

function vehicleValues(input) {
  return {
    vehicleNo: requireText(input.vehicleNo, "Vehicle number", 20).toUpperCase(),
    ownerName: optionalText(input.ownerName, "Owner name", 120) || null,
    ownerMob: optionalText(input.ownerMob, "Owner mobile", 20) || null,
    driverName: optionalText(input.driverName, "Driver name", 120) || null,
    driverMob: optionalText(input.driverMob, "Driver mobile", 20) || null,
    dlNo: optionalText(input.dlNo, "Driving licence", 40).toUpperCase() || null,
    aadhaarEncrypted: encryptSensitive(cleanAadhaar(input.aadhaar)),
  };
}

export async function createVehicle(user, input, ctx) {
  const values = vehicleValues(input);
  const displayId = await nextMasterId(db, vehicles, user.tenantId, "VEH");
  await db.insert(vehicles).values({ tenantId: user.tenantId, displayId, ...values });
  await writeAudit(db, {
    tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "master",
    action: "create", entity: "vehicle", entityId: displayId, description: `Vehicle ${values.vehicleNo} added`, ctx,
  });
  return getBootstrap(user);
}

export async function updateVehicle(user, id, input, ctx) {
  const values = vehicleValues(input);
  const result = await db
    .update(vehicles)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(vehicles.tenantId, user.tenantId), eq(vehicles.displayId, id)))
    .returning({ id: vehicles.id });
  if (!result.length) throw new Error("Vehicle not found.");
  await writeAudit(db, {
    tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "master",
    action: "update", entity: "vehicle", entityId: id, description: `Vehicle ${values.vehicleNo} updated`, ctx,
  });
  return getBootstrap(user);
}

export async function getCounters(user) {
  return countersFor(user.tenantId);
}

/** Admin configures / resets the invoice + challan numbering (prefix + next number). */
export async function updateCounters(user, patch, ctx) {
  for (const docType of ["invoice", "challan"]) {
    const cfg = patch?.[docType];
    if (!cfg) continue;
    const prefix = optionalText(cfg.prefix, "Prefix", 12);
    const next = Math.max(1, Math.round(Number(cfg.next) || 1));
    const lastNumber = next - 1;
    await db
      .insert(billCounters)
      .values({ tenantId: user.tenantId, docType, prefix: prefix || "", lastNumber })
      .onConflictDoUpdate({
        target: [billCounters.tenantId, billCounters.docType],
        set: { prefix: prefix || "", lastNumber, updatedAt: new Date() },
      });
  }
  await writeAudit(db, {
    tenantId: user.tenantId, actorUserId: user.id, actorName: user.displayName, eventKind: "settings",
    action: "update", entity: "settings", entityId: "serials", description: "Document numbering updated", ctx,
  });
  return getBootstrap(user);
}

export { publicUser };
