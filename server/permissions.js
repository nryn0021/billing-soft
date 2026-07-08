// Granular permission catalog + role defaults. The backend is the source of truth;
// the resolved permission list is attached to the session user and sent to the client,
// which gates pages, features and individual action buttons off the same keys.

export const PERMISSION_GROUPS = [
  {
    group: "Dashboard", items: [
      { key: "dashboard.view", label: "View dashboard" },
    ],
  },
  {
    group: "Billing", items: [
      { key: "bills.view", label: "View bills" },
      { key: "bills.create", label: "Create bills" },
      { key: "bills.print", label: "Print / reprint bills" },
      { key: "bills.export", label: "Export bills" },
    ],
  },
  {
    group: "Parties", items: [
      { key: "parties.view", label: "View parties & ledgers" },
      { key: "parties.create", label: "Add parties" },
      { key: "parties.edit", label: "Edit parties" },
      { key: "parties.export", label: "Export parties" },
    ],
  },
  {
    group: "Inventory", items: [
      { key: "inventory.view", label: "View inventory" },
      { key: "inventory.adjust", label: "Adjust stock" },
      { key: "inventory.transfer", label: "Transfer stock" },
      { key: "inventory.export", label: "Export inventory" },
    ],
  },
  {
    group: "Rates", items: [
      { key: "rates.view", label: "View rate book" },
      { key: "rates.edit", label: "Change base rates" },
    ],
  },
  {
    group: "Reports", items: [
      { key: "reports.view", label: "View reports" },
      { key: "reports.export", label: "Export reports" },
    ],
  },
  {
    group: "Truck tracking", items: [
      { key: "tracking.view", label: "View truck tracking" },
      { key: "tracking.update", label: "Update truck status" },
    ],
  },
  {
    group: "Tally", items: [
      { key: "tally.export", label: "Export to Tally" },
      { key: "tally.import", label: "Import from Tally" },
    ],
  },
  {
    group: "Administration", items: [
      { key: "users.view", label: "View users" },
      { key: "users.manage", label: "Create / manage users" },
      { key: "users.reset_password", label: "Reset passwords" },
      { key: "audit.view", label: "View audit log" },
      { key: "settings.view", label: "View settings" },
      { key: "settings.manage", label: "Edit settings" },
      { key: "backup.manage", label: "Backup & restore" },
    ],
  },
];

export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key));

export const DEFAULT_ROLE_PERMISSIONS = {
  admin: ALL_PERMISSIONS.slice(),
  manager: [
    "dashboard.view",
    "bills.view", "bills.print", "bills.export",
    "parties.view", "parties.create", "parties.edit", "parties.export",
    "inventory.view", "inventory.adjust", "inventory.transfer", "inventory.export",
    "rates.view", "rates.edit",
    "reports.view", "reports.export",
    "tracking.view", "tracking.update",
    "tally.export", "tally.import",
    "audit.view", "settings.view",
  ],
  biller: [
    "dashboard.view",
    "bills.view", "bills.create", "bills.print",
    "parties.view", "parties.create", "parties.edit",
    "inventory.view",
    "tracking.view", "tracking.update",
  ],
};

/** Effective permissions for a role, honouring per-tenant overrides from settings. */
export function resolvePermissions(role, overrides) {
  const base = DEFAULT_ROLE_PERMISSIONS[role] || [];
  const override = overrides?.[role];
  const list = Array.isArray(override) ? override : base;
  // Admin always retains settings.manage + users.manage so a tenant can never lock itself out.
  if (role === "admin") return Array.from(new Set([...list, "settings.manage", "settings.view", "users.manage", "users.view"]));
  return list;
}

export function can(user, permission) {
  return Array.isArray(user?.permissions) && user.permissions.includes(permission);
}
