// Client-side mirror of the backend permission catalog (server/permissions.js).
// The bootstrap payload ships `data.permissionGroups` from the server (the source of
// truth); this local copy is only a fallback so the Roles & Access editor can never
// render empty if that payload is ever missing, plus the per-role defaults used to
// seed the switches before any override has been saved.

export const PERMISSION_CATALOG = [
  { group: "Dashboard", items: [{ key: "dashboard.view", label: "View dashboard" }] },
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

// Keys an admin can never lose (matches the server-side safety lock in resolvePermissions).
export const ADMIN_LOCKED_PERMISSIONS = ["settings.view", "settings.manage", "users.view", "users.manage"];

/** Default permissions for a role before any tenant override is saved. */
export function defaultRolePermissions(role, allKeys) {
  if (role === "admin") return allKeys.slice();
  if (role === "manager") {
    return allKeys.filter((k) => !k.startsWith("users.") && k !== "settings.manage" && k !== "bills.create" && k !== "backup.manage");
  }
  // biller
  return ["dashboard.view", "bills.view", "bills.create", "bills.print", "parties.view", "parties.create", "parties.edit", "inventory.view", "tracking.view", "tracking.update"]
    .filter((k) => allKeys.includes(k));
}
