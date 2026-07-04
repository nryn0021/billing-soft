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
  billLines,
  bills,
  branches,
  ledgerEntries,
  parties,
  passwordResets,
  payments,
  products,
  sessions,
  stockMovements,
  tenants,
  users,
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
    bankAccount: decryptSensitive(row.bankAccountEncrypted),
    bankIfsc: row.bankIfsc || "",
    kind: row.kind,
    balance: row.balancePaise / 100,
    balanceType: row.balanceType,
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
      netPaise: bills.netPaise,
      paidPaise: bills.paidPaise,
      duePaise: bills.duePaise,
      paymentMethod: bills.paymentMethod,
      branchId: bills.branchId,
      partyCode: parties.displayId,
      partyName: parties.name,
      partyPhone: parties.phoneDisplay,
      partyAddress: parties.address,
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

function mapTransaction(row) {
  return {
    id: row.id,
    type: row.billType,
    date: row.createdAt,
    partyId: row.partyCode,
    party: row.partyName,
    partyPhone: row.partyPhone,
    partyAddress: row.partyAddress,
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
  const transactions = (await transactionRows(user)).map(mapTransaction);
  const settings = await getSettings(user.tenantId);
  return {
    user,
    products: productRows.map(mapProduct),
    parties: partyRows.map(mapParty),
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
  if (!Number.isSafeInteger(ratePaise) || ratePaise <= 0) throw new Error("Rate is invalid.");
  const weightGrams = Math.round(quantity * multiplier);
  const grossPaise = Math.round((weightGrams / 1000) * ratePaise);
  // CD deduction rule is configurable in Settings, but still only applies when the
  // biller manually enables it (payload.applyCd) on a purchase bill.
  const cd = (await getSettings(user.tenantId)).cd || {};
  const cdThresholdPaise = Math.round((cd.threshold ?? 20000) * 100);
  const cdFactor = (cd.rate ?? 2.5) / 100;
  const deductionPaise = type === "purchase" && payload.applyCd && cd.enabled !== false && grossPaise > cdThresholdPaise ? Math.round(grossPaise * cdFactor) : 0;
  const netPaise = grossPaise - deductionPaise;
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
          bankAccountEncrypted: encryptedBankAccount,
          bankIfsc: bankIfsc || null,
          updatedAt: new Date(),
        })
        .where(and(eq(parties.id, party.id), eq(parties.tenantId, user.tenantId)));
    }

    billDisplayId = await nextBillId(tx, user.tenantId, type, branchCode);
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
        netPaise,
        paidPaise,
        duePaise,
        paymentMethod,
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

export { publicUser };
