// Idempotent seed for a single default tenant. Safe to run repeatedly: each
// section is skipped once its rows exist for the tenant.
//
// Run after the schema is in place:  npm run db:push && npm run db:seed
// (or just  npm run db:init).
import { and, eq, sql } from "drizzle-orm";
import { INITIAL_DATA } from "../src/data/seed.js";
import { closePool, db } from "./db.js";
import {
  auditEvents,
  billLines,
  bills,
  branches,
  parties,
  products,
  tenants,
  users,
} from "./schema.js";
import { encryptSensitive } from "./crypto.js";
import { hashPassword, normalizePhone } from "./security.js";

const TENANT_SLUG = (process.env.JMD_TENANT_SLUG || "jmd").toLowerCase();
const TENANT_NAME = process.env.JMD_TENANT_NAME || "Jai Mata Di Gud Mill";

async function countRows(table, where) {
  const [row] = await db.select({ n: sql`count(*)::int` }).from(table).where(where);
  return Number(row.n);
}

async function ensureTenant() {
  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, TENANT_SLUG)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(tenants).values({ slug: TENANT_SLUG, name: TENANT_NAME }).returning();
  return created;
}

async function seed() {
  const tenant = await ensureTenant();
  const tenantId = tenant.id;

  // Branches -------------------------------------------------------------
  const branchDefs = [
    { code: "AMARPUR", name: "Amarpur", invoicePrefix: "AMP" },
    { code: "SAMUKHIYA", name: "Samukhiya", invoicePrefix: "SMK" },
  ];
  const branchIdByCode = new Map();
  for (const def of branchDefs) {
    let [row] = await db
      .select()
      .from(branches)
      .where(and(eq(branches.tenantId, tenantId), eq(branches.code, def.code)))
      .limit(1);
    if (!row) [row] = await db.insert(branches).values({ tenantId, ...def }).returning();
    branchIdByCode.set(def.code, row.id);
  }
  const branchIdByName = new Map([
    ["Amarpur", branchIdByCode.get("AMARPUR")],
    ["Samukhiya", branchIdByCode.get("SAMUKHIYA")],
  ]);

  // Users ----------------------------------------------------------------
  if ((await countRows(users, eq(users.tenantId, tenantId))) === 0) {
    const accounts = [
      ["pankaj", "Pankaj Kumar Das", "JMD@9955299279", "admin", null],
      ["amarpur.biller", "Amarpur Biller", "Biller@2026", "biller", "AMARPUR"],
      ["samukhiya.biller", "Samukhiya Biller", "Biller@2026", "biller", "SAMUKHIYA"],
      ["manager", "Mill Manager", "Manager@2026", "manager", null],
    ];
    for (const [username, displayName, password, role, branchCode] of accounts) {
      const credentials = hashPassword(password);
      await db.insert(users).values({
        tenantId,
        username,
        displayName,
        passwordHash: credentials.hash,
        passwordSalt: credentials.salt,
        role,
        branchId: branchCode ? branchIdByCode.get(branchCode) : null,
      });
    }
  }

  // Products -------------------------------------------------------------
  const productIdByDisplay = new Map();
  if ((await countRows(products, eq(products.tenantId, tenantId))) === 0) {
    for (const item of INITIAL_DATA.products) {
      const [row] = await db
        .insert(products)
        .values({
          tenantId,
          displayId: item.id,
          name: item.name,
          hindiName: item.hindiName,
          shortCode: item.short,
          category: item.category,
          baseRatePaise: Math.round(item.baseRate * 100),
          stockGrams: Math.round(item.stockKg * 1000),
        })
        .returning({ id: products.id, displayId: products.displayId });
      productIdByDisplay.set(row.displayId, row.id);
    }
  } else {
    const rows = await db.select({ id: products.id, displayId: products.displayId }).from(products).where(eq(products.tenantId, tenantId));
    for (const row of rows) productIdByDisplay.set(row.displayId, row.id);
  }

  // Parties --------------------------------------------------------------
  const partyIdByDisplay = new Map();
  if ((await countRows(parties, eq(parties.tenantId, tenantId))) === 0) {
    for (const item of INITIAL_DATA.parties) {
      const [row] = await db
        .insert(parties)
        .values({
          tenantId,
          displayId: item.id,
          name: item.name,
          phoneNormalized: normalizePhone(item.phone),
          phoneDisplay: item.phone,
          address: item.address,
          kind: item.kind,
          balancePaise: Math.round(item.balance * 100),
          balanceType: item.balanceType,
          bankAccountEncrypted: encryptSensitive(item.bank?.account),
          bankIfsc: item.bank?.ifsc || null,
        })
        .returning({ id: parties.id, displayId: parties.displayId });
      partyIdByDisplay.set(row.displayId, row.id);
    }
  } else {
    const rows = await db.select({ id: parties.id, displayId: parties.displayId }).from(parties).where(eq(parties.tenantId, tenantId));
    for (const row of rows) partyIdByDisplay.set(row.displayId, row.id);
  }

  // Bills + lines --------------------------------------------------------
  if ((await countRows(bills, eq(bills.tenantId, tenantId))) === 0) {
    for (const item of INITIAL_DATA.transactions) {
      const branchId = branchIdByName.get(item.branch) || branchIdByCode.get("AMARPUR");
      const partyId = partyIdByDisplay.get(item.partyId);
      const productId = productIdByDisplay.get(item.productId);
      if (!partyId || !productId) continue;
      const [bill] = await db
        .insert(bills)
        .values({
          tenantId,
          displayId: item.id,
          billType: item.type,
          partyId,
          branchId,
          grossPaise: Math.round(item.gross * 100),
          deductionPaise: Math.round(item.cdDeduction * 100),
          netPaise: Math.round(item.netAmount * 100),
          paidPaise: Math.round(item.paidAmount * 100),
          duePaise: Math.round(item.dueAmount * 100),
          paymentMethod: item.paymentMethod,
          createdAt: new Date(item.date),
        })
        .returning({ id: bills.id });
      await db.insert(billLines).values({
        tenantId,
        billId: bill.id,
        productId,
        enteredQuantity: item.quantity,
        enteredUnit: item.unit,
        weightGrams: Math.round(item.totalKg * 1000),
        ratePaisePerKg: Math.round(item.rate * 100),
        baseRatePaisePerKg: Math.round(item.baseRate * 100),
        amountPaise: Math.round(item.gross * 100),
      });
    }
  }

  // Audit events ---------------------------------------------------------
  if ((await countRows(auditEvents, eq(auditEvents.tenantId, tenantId))) === 0) {
    for (const item of INITIAL_DATA.audits) {
      await db.insert(auditEvents).values({
        tenantId,
        eventKind: item.kind,
        description: item.text,
        metadata: item.meta,
        createdAt: new Date(item.date),
      });
    }
  }

  console.log(`Seed complete for tenant "${TENANT_SLUG}" (${TENANT_NAME}).`);
  console.log(`Sign in with mill code "${TENANT_SLUG}", admin username "pankaj".`);
}

seed()
  .then(closePool)
  .catch(async (error) => {
    console.error("Seed failed:", error);
    await closePool();
    process.exitCode = 1;
  });
