import { forbidden } from './errors';

/**
 * One permission model for the whole BOS.
 *
 * The existing `admins` table uses owner/editor/viewer. Newer directories use
 * owner/admin/manager/editor/analyst/support/viewer. Both are mapped here so a
 * caller is authorized consistently regardless of which surface created them.
 */
export type BosRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'editor'
  | 'analyst'
  | 'support'
  | 'viewer';

export const PERMISSIONS = [
  'catalog.read',
  'catalog.write',
  'catalog.publish',
  'inventory.read',
  'inventory.write',
  'order.read',
  'order.write',
  'order.refund',
  'customer.read',
  'customer.write',
  'finance.read',
  'finance.write',
  'marketing.read',
  'marketing.write',
  'loyalty.read',
  'loyalty.write',
  'support.read',
  'support.write',
  'review.read',
  'review.moderate',
  'supplier.read',
  'supplier.write',
  'workforce.read',
  'workforce.write',
  'governance.read',
  'governance.write',
  'report.export',
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

const READ_ONLY = PERMISSIONS.filter((key) => key.endsWith('.read'));

const EDITOR: PermissionKey[] = [
  'catalog.read',
  'catalog.write',
  'catalog.publish',
  'inventory.read',
  'inventory.write',
  'order.read',
  'order.write',
  'customer.read',
  'support.read',
  'review.read',
  'supplier.read',
  'report.export',
];

const MANAGER: PermissionKey[] = [
  ...EDITOR,
  'order.refund',
  'customer.write',
  'finance.read',
  'marketing.read',
  'marketing.write',
  'loyalty.read',
  'loyalty.write',
  'support.write',
  'review.moderate',
  'supplier.write',
  'workforce.read',
  'governance.read',
];

const SUPPORT: PermissionKey[] = [
  'order.read',
  'customer.read',
  'customer.write',
  'support.read',
  'support.write',
  'review.read',
  'loyalty.read',
];

/** Explicit matrix. `owner` and `admin` hold every permission. */
export const ROLE_PERMISSIONS: Record<BosRole, ReadonlySet<PermissionKey>> = {
  owner: new Set(PERMISSIONS),
  admin: new Set(PERMISSIONS),
  manager: new Set(MANAGER),
  editor: new Set(EDITOR),
  analyst: new Set([...READ_ONLY, 'report.export']),
  support: new Set(SUPPORT),
  viewer: new Set(READ_ONLY),
};

export function normalizeRole(value: unknown): BosRole {
  const role = String(value || '').toLowerCase().trim();
  if (role in ROLE_PERMISSIONS) return role as BosRole;
  return 'viewer';
}

export function hasPermission(role: unknown, permission: PermissionKey): boolean {
  return ROLE_PERMISSIONS[normalizeRole(role)].has(permission);
}

export function assertPermission(role: unknown, permission: PermissionKey): void {
  if (!hasPermission(role, permission)) {
    throw forbidden(`Missing required permission: ${permission}.`);
  }
}

export function isWritePermission(permission: PermissionKey): boolean {
  return !permission.endsWith('.read') && permission !== 'report.export';
}

/** Sensitive actions require an explicit second approval. */
export const APPROVAL_REQUIRED: ReadonlySet<PermissionKey> = new Set([
  'order.refund',
  'workforce.write',
  'governance.write',
  'finance.write',
]);

export function requiresApproval(permission: PermissionKey): boolean {
  return APPROVAL_REQUIRED.has(permission);
}
