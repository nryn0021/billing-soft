// Multi-tenant PostgreSQL schema (Drizzle ORM).
//
// Design rules that mirror the original SQLite model:
//  - Structural primary keys are UUIDs (gen_random_uuid via .defaultRandom()).
//  - Readable identifiers (PTY-1001, SAL-AMP-0001, RICE-SONAM, AMARPUR) live on as
//    `display_id` / `code` columns for the frontend and printed invoices.
//  - Every business table carries `tenant_id` for strict isolation. Uniqueness that
//    used to be global (usernames, phone numbers, product/branch names, display ids)
//    is now scoped per tenant.
//  - Money is integer paise and weight is integer grams. We use bigint(mode:'number')
//    so a single overflowing bill can't wrap int4, while values stay JS numbers
//    (safe below 2^53) for the existing /100 and /1000 formatting math.

import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const paise = (name) => bigint(name, { mode: "number" });
const grams = (name) => bigint(name, { mode: "number" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tenants_slug_unique").on(sql`lower(${t.slug})`)],
);

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    code: text("code").notNull(), // readable id, e.g. AMARPUR
    name: text("name").notNull(),
    invoicePrefix: text("invoice_prefix").notNull(),
    active: boolean("active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("branches_tenant_code_unique").on(t.tenantId, t.code),
    uniqueIndex("branches_tenant_name_unique").on(t.tenantId, t.name),
    uniqueIndex("branches_tenant_prefix_unique").on(t.tenantId, t.invoicePrefix),
  ],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    role: text("role").notNull(),
    branchId: uuid("branch_id").references(() => branches.id),
    active: boolean("active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(true),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    // Case-insensitive uniqueness per tenant (replaces SQLite COLLATE NOCASE).
    uniqueIndex("users_tenant_username_unique").on(t.tenantId, sql`lower(${t.username})`),
    check("users_role_check", sql`${t.role} in ('admin','manager','biller')`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    csrfToken: text("csrf_token").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(), // epoch milliseconds
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("sessions_token_hash_unique").on(t.tokenHash),
    index("idx_sessions_expires").on(t.expiresAt),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    displayId: text("display_id").notNull(), // readable id, e.g. RICE-SONAM
    name: text("name").notNull(),
    hindiName: text("hindi_name"),
    shortCode: text("short_code").notNull(),
    category: text("category").notNull(),
    baseRatePaise: paise("base_rate_paise").notNull(),
    stockGrams: grams("stock_grams").notNull().default(0),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("products_tenant_display_unique").on(t.tenantId, t.displayId),
    uniqueIndex("products_tenant_name_unique").on(t.tenantId, t.name),
    check("products_base_rate_check", sql`${t.baseRatePaise} >= 0`),
    check("products_stock_check", sql`${t.stockGrams} >= 0`),
  ],
);

export const parties = pgTable(
  "parties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    displayId: text("display_id").notNull(), // readable id, e.g. PTY-1001
    name: text("name").notNull(),
    phoneNormalized: text("phone_normalized").notNull(),
    phoneDisplay: text("phone_display").notNull(),
    address: text("address").notNull(),
    kind: text("kind").notNull(),
    balancePaise: paise("balance_paise").notNull().default(0),
    balanceType: text("balance_type").notNull().default("debtor"),
    bankAccountEncrypted: text("bank_account_encrypted"),
    bankIfsc: text("bank_ifsc"),
    gstin: text("gstin"), // buyer/supplier GSTIN — nullable, additive (migration-safe)
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("parties_tenant_display_unique").on(t.tenantId, t.displayId),
    uniqueIndex("parties_tenant_phone_unique").on(t.tenantId, t.phoneNormalized),
    index("idx_parties_name").on(t.tenantId, t.name),
    check("parties_kind_check", sql`${t.kind} in ('customer','supplier','both')`),
    check("parties_balance_type_check", sql`${t.balanceType} in ('debtor','creditor')`),
  ],
);

export const bills = pgTable(
  "bills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    displayId: text("display_id").notNull(), // readable id, e.g. SAL-AMP-0001
    billType: text("bill_type").notNull(),
    partyId: uuid("party_id")
      .notNull()
      .references(() => parties.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    createdBy: uuid("created_by").references(() => users.id),
    grossPaise: paise("gross_paise").notNull(),
    deductionPaise: paise("deduction_paise").notNull().default(0),
    discountPaise: paise("discount_paise").notNull().default(0),
    netPaise: paise("net_paise").notNull(),
    paidPaise: paise("paid_paise").notNull().default(0),
    duePaise: paise("due_paise").notNull().default(0),
    paymentMethod: text("payment_method").notNull(),
    status: text("status").notNull().default("posted"),
    // Extra document data for detailed "truck sale" bills (GST Bill of Supply + transport
    // Challan): consignee GSTIN, HSN, vehicle/driver/transport, freight & bhara figures, etc.
    // Null for ordinary sale/purchase bills. Additive & nullable → migration-safe.
    meta: jsonb("meta"),
    remarks: text("remarks"), // free-text note shown on the bill/popup — nullable, additive
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("bills_tenant_display_unique").on(t.tenantId, t.displayId),
    index("idx_bills_created_at").on(t.tenantId, t.createdAt),
    index("idx_bills_branch").on(t.tenantId, t.branchId, t.createdAt),
    check("bills_type_check", sql`${t.billType} in ('sale','purchase')`),
    check("bills_status_check", sql`${t.status} in ('posted','cancelled')`),
  ],
);

export const billLines = pgTable(
  "bill_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    billId: uuid("bill_id")
      .notNull()
      .references(() => bills.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    enteredQuantity: doublePrecision("entered_quantity").notNull(),
    enteredUnit: text("entered_unit").notNull(),
    weightGrams: grams("weight_grams").notNull(),
    ratePaisePerKg: paise("rate_paise_per_kg").notNull(),
    baseRatePaisePerKg: paise("base_rate_paise_per_kg").notNull(),
    amountPaise: paise("amount_paise").notNull(),
  },
  (t) => [
    index("idx_bill_lines_bill").on(t.billId),
    check("bill_lines_unit_check", sql`${t.enteredUnit} in ('kg','quintal','tonne')`),
  ],
);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  billId: uuid("bill_id")
    .notNull()
    .references(() => bills.id),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id),
  amountPaise: paise("amount_paise").notNull(),
  method: text("method").notNull(),
  createdAt: createdAt(),
});

export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    billId: uuid("bill_id").references(() => bills.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    quantityGrams: grams("quantity_grams").notNull(),
    balanceGrams: grams("balance_grams"), // stock level after this movement
    movementType: text("movement_type").notNull(), // sale|purchase|adjustment|transfer-in|transfer-out|opening
    note: text("note"),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("idx_stock_product_branch").on(t.tenantId, t.productId, t.branchId)],
);

export const ledgerEntries = pgTable("ledger_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  billId: uuid("bill_id").references(() => bills.id),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id),
  entryType: text("entry_type").notNull(),
  amountPaise: paise("amount_paise").notNull(),
  createdAt: createdAt(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    actorName: text("actor_name"),
    eventKind: text("event_kind").notNull(),
    description: text("description").notNull(),
    metadata: text("metadata"),
    action: text("action"), // create|update|delete|login|security|...
    entity: text("entity"), // bill|party|product|user|settings|...
    entityId: text("entity_id"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    ipAddress: text("ip_address"),
    device: text("device"),
    createdAt: createdAt(),
  },
  (t) => [index("idx_audit_created").on(t.tenantId, t.createdAt)],
);

// Per-tenant application settings as a single JSON document. Everything the owner
// can edit (business profile, bank, UPI, QR image, invoice text, prefixes, thermal
// width, CD rules, theme, notification prefs, role permissions) lives here.
export const appSettings = pgTable("app_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" })
    .unique(),
  data: jsonb("data").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Password reset tokens (email-independent: admin can reset directly, or a token is
// minted for the owner to relay out-of-band).
export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("password_resets_token_unique").on(t.tokenHash)],
);

// Per-tenant auto-increment counters for truck-sale document numbers (Bill of Supply
// "Invoice No." + transport "Challan No."). Numbers are assigned atomically inside the
// bill transaction via UPDATE ... RETURNING; the admin can set the prefix / next number.
export const billCounters = pgTable(
  "bill_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    docType: text("doc_type").notNull(), // 'invoice' | 'challan'
    prefix: text("prefix").notNull().default(""),
    lastNumber: bigint("last_number", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("bill_counters_tenant_type_unique").on(t.tenantId, t.docType),
    check("bill_counters_type_check", sql`${t.docType} in ('invoice','challan')`),
  ],
);

// Master list of transporters (name + phone) so operators pick instead of retyping.
export const transporters = pgTable(
  "transporters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    displayId: text("display_id").notNull(), // readable id, e.g. TRP-1001
    name: text("name").notNull(),
    phone: text("phone"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("transporters_tenant_display_unique").on(t.tenantId, t.displayId),
    index("idx_transporters_name").on(t.tenantId, t.name),
  ],
);

// Master list of vehicles with linked owner + driver details. Aadhaar is encrypted at
// rest (like bank accounts). Selecting a vehicle auto-fills owner/driver on the composer.
export const vehicles = pgTable(
  "vehicles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    displayId: text("display_id").notNull(), // readable id, e.g. VEH-1001
    vehicleNo: text("vehicle_no").notNull(),
    ownerName: text("owner_name"),
    ownerMob: text("owner_mob"),
    driverName: text("driver_name"),
    driverMob: text("driver_mob"),
    dlNo: text("dl_no"),
    aadhaarEncrypted: text("aadhaar_encrypted"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("vehicles_tenant_display_unique").on(t.tenantId, t.displayId),
    uniqueIndex("vehicles_tenant_vehicleno_unique").on(t.tenantId, t.vehicleNo),
  ],
);

export const schema = {
  tenants,
  branches,
  users,
  sessions,
  products,
  parties,
  bills,
  billLines,
  payments,
  stockMovements,
  ledgerEntries,
  auditEvents,
  appSettings,
  passwordResets,
  billCounters,
  transporters,
  vehicles,
};
