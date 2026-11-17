import { action, defineSystem } from '../core/system';
import { db, numeric, asRecord } from '../core/repository';
import { audit } from '../core/audit';
import { bosId } from '../core/ids';
import { badRequest, conflict, notFound } from '../core/errors';
import { PERMISSIONS, ROLE_PERMISSIONS, normalizeRole, type BosRole } from '../core/authz';
import { stringField, optionalString, intField, boolField, enumField, pagination } from '../core/validation';

const ROLES = ['owner', 'admin', 'manager', 'editor', 'analyst', 'support', 'viewer'] as const;
const EMPLOYEE_STATUSES = ['active', 'suspended', 'disabled'] as const;

interface SettingsRow {
  id: string;
  storeInfo?: unknown;
  shippingRates?: unknown;
  freeShippingThreshold?: number | null;
  vatRate?: number | null;
  consentText?: unknown;
  lowStockThreshold?: number | null;
  updatedAt?: string | null;
}

export const settingsSystem = defineSystem({
  id: 'settings',
  index: 19,
  name: 'Settings & Access',
  screen: 'settings',
  description: 'Store configuration, workforce roles and feature flags.',
  actions: {
    get: action('workforce.read', 'Store settings, team and flags.', async () => {
      const [settings, team, flags] = await Promise.all([
        db.one<SettingsRow>(db.from('settings').select('*').eq('id', 'store').maybeSingle()),
        db.rows<any>(db.from('bos_employees').select('*').order('email').limit(200)),
        db.rows<any>(db.from('system_feature_flags').select('*').order('flag_key').limit(200)),
      ]);
      return { settings: settings || null, team, flags, permissions: PERMISSIONS };
    }),

    update: action('workforce.write', 'Update store settings with optimistic concurrency.', async (ctx, input) => {
      const existing = await db.one<SettingsRow>(
        db.from('settings').select('*').eq('id', 'store').maybeSingle()
      );
      const expected = optionalString(input, 'expectedUpdatedAt', 60);
      if (expected && existing?.updatedAt && expected !== existing.updatedAt) {
        throw conflict('Settings changed since you loaded them. Reload and try again.', {
          currentUpdatedAt: existing.updatedAt,
        });
      }
      const patch: Record<string, unknown> = { id: 'store', updatedAt: new Date().toISOString() };

      if (input.storeInfo !== undefined) patch.storeInfo = asRecord(input.storeInfo);
      if (input.consentText !== undefined) patch.consentText = asRecord(input.consentText);
      if (input.vatRate !== undefined) {
        const value = numeric(input.vatRate, -1);
        if (value < 0 || value > 100) throw badRequest('VAT rate must be between 0 and 100.');
        patch.vatRate = value;
      }
      if (input.lowStockThreshold !== undefined) {
        patch.lowStockThreshold = intField(input, 'lowStockThreshold', { min: 0, max: 100000 });
      }
      if (input.freeShippingThreshold !== undefined) {
        const value = numeric(input.freeShippingThreshold, -1);
        if (value < 0) throw badRequest('Free-shipping threshold cannot be negative.');
        patch.freeShippingThreshold = value;
      }
      if (input.shippingRates !== undefined) {
        if (!Array.isArray(input.shippingRates)) throw badRequest('shippingRates must be an array.');
        if (input.shippingRates.length > 20) throw badRequest('Too many shipping methods.');
        patch.shippingRates = input.shippingRates.map((raw) => {
          const rate = asRecord(raw);
          const method = String(rate.method || '').trim();
          if (!method) throw badRequest('Every shipping method needs a method key.');
          const price = numeric(rate.price, -1);
          if (price < 0) throw badRequest('Shipping price cannot be negative.');
          return {
            id: String(rate.id || method.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
            method,
            name: asRecord(rate.name),
            price,
            eta: String(rate.eta || ''),
            freeOver: rate.freeOver === undefined ? undefined : numeric(rate.freeOver, 0),
          };
        });
      }
      if (Object.keys(patch).length <= 2) throw badRequest('Nothing to update.');

      await db.from('settings').upsert(patch, { onConflict: 'id' });
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'settings.update',
        targetType: 'settings',
        targetId: 'store',
        before: existing ? { vatRate: existing.vatRate, lowStockThreshold: existing.lowStockThreshold } : undefined,
        after: patch,
        requestId: ctx.requestId,
      });
      return { updated: Object.keys(patch), updatedAt: patch.updatedAt };
    }),

    permissions: action('workforce.read', 'Role permission matrix.', async () => {
      return {
        permissions: PERMISSIONS,
        roles: ROLES.map((role) => ({
          role,
          permissions: Array.from(ROLE_PERMISSIONS[role as BosRole]),
        })),
      };
    }),

    team: action('workforce.read', 'Workforce directory.', async (_ctx, input) => {
      const { limit, offset } = pagination(input);
      const [rows, total] = await Promise.all([
        db.rows<any>(db.from('bos_employees').select('*').order('email').range(offset, offset + limit - 1)),
        db.count(db.from('bos_employees').select('*', { count: 'exact', head: true })),
      ]);
      return { team: rows, total, limit, offset };
    }),

    teamSave: action('workforce.write', 'Invite or update a team member.', async (ctx, input) => {
      const email = stringField(input, 'email', { required: true, max: 254 }).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw badRequest('A valid email is required.');
      const id = optionalString(input, 'id', 80) || bosId('emp');
      const existing = await db.one<any>(
        db.from('bos_employees').select('*').eq('id', id).maybeSingle()
      );
      const role = input.role === undefined ? normalizeRole(existing?.role) : enumField(input, 'role', ROLES);
      const status =
        input.status === undefined
          ? existing?.status || 'active'
          : enumField(input, 'status', EMPLOYEE_STATUSES);
      const name = input.name === undefined ? existing?.name || '' : stringField(input, 'name', { max: 120 });
      const approvalLimitMinor =
        input.approvalLimitMinor === undefined
          ? Math.max(0, Math.trunc(numeric(existing?.approval_limit_minor, 0)))
          : intField(input, 'approvalLimitMinor', { min: 0, max: 100_000_000 });

      if (email === ctx.actor.email.toLowerCase() && role !== 'owner' && role !== 'admin') {
        throw badRequest('You cannot remove your own administrative access.');
      }
      if (existing?.role === 'owner' && role !== 'owner') {
        const owners = await db.count(
          db
            .from('bos_employees')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'owner')
            .eq('status', 'active')
        );
        if (owners <= 1) throw badRequest('The last active owner cannot be demoted.');
      }
      const emailOwner = await db.one<any>(
        db.from('bos_employees').select('id, email').eq('email', email).maybeSingle()
      );
      if (emailOwner && emailOwner.id !== id) {
        throw conflict('This email already belongs to another team member.', { id: emailOwner.id });
      }

      await db.from('bos_employees').upsert(
        {
          id,
          email,
          name,
          role,
          status,
          approval_limit_minor: approvalLimitMinor,
          department: optionalString(input, 'department', 80) || existing?.department || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: existing ? 'workforce.member.update' : 'workforce.member.invite',
        targetType: 'employee',
        targetId: id,
        before: existing ? { role: existing.role, status: existing.status } : undefined,
        after: { email, role, status },
        requestId: ctx.requestId,
      });
      return { id, email, role, status };
    }),

    teamDisable: action('workforce.write', 'Disable a team member without deleting history.', async (ctx, input) => {
      const id = stringField(input, 'id', { required: true, max: 80 });
      const existing = await db.one<any>(
        db.from('bos_employees').select('*').eq('id', id).maybeSingle()
      );
      if (!existing) throw notFound('Team member not found.');
      if (String(existing.email).toLowerCase() === ctx.actor.email.toLowerCase()) {
        throw badRequest('You cannot disable your own account.');
      }
      if (existing.role === 'owner') {
        const owners = await db.count(
          db
            .from('bos_employees')
            .select('*', { count: 'exact', head: true })
            .eq('role', 'owner')
            .eq('status', 'active')
        );
        if (owners <= 1) throw badRequest('The last active owner cannot be disabled.');
      }
      await db
        .from('bos_employees')
        .update({ status: 'disabled', updated_at: new Date().toISOString() })
        .eq('id', id);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'workforce.member.disable',
        targetType: 'employee',
        targetId: id,
        before: { status: existing.status },
        after: { status: 'disabled' },
        requestId: ctx.requestId,
      });
      return { id, status: 'disabled' };
    }),

    flags: action('workforce.read', 'Feature flags.', async () => {
      const rows = await db.rows<any>(
        db.from('system_feature_flags').select('*').order('flag_key')
      );
      return { flags: rows };
    }),

    flagToggle: action('workforce.write', 'Enable or disable a feature flag.', async (ctx, input) => {
      const key = stringField(input, 'key', { required: true, max: 80 });
      const enabled = boolField(input, 'enabled', false);
      const existing = await db.one<any>(
        db.from('system_feature_flags').select('*').eq('flag_key', key).maybeSingle()
      );
      if (!existing) throw notFound('Feature flag not found.');
      const patch: Record<string, unknown> = {
        enabled,
        updated_by: ctx.actor.email,
        updated_at: new Date().toISOString(),
      };
      if (input.rolloutPercent !== undefined) {
        patch.rollout_percent = intField(input, 'rolloutPercent', { min: 0, max: 100 });
      }
      await db.from('system_feature_flags').update(patch).eq('flag_key', key);
      await audit({
        actorId: ctx.actor.id,
        actorEmail: ctx.actor.email,
        role: ctx.actor.role,
        action: 'settings.flag.toggle',
        targetType: 'feature_flag',
        targetId: key,
        before: { enabled: existing.enabled, rollout_percent: existing.rollout_percent },
        after: patch,
        requestId: ctx.requestId,
      });
      return { key, enabled, rolloutPercent: patch.rollout_percent ?? existing.rollout_percent };
    }),

    admins: action('workforce.read', 'Legacy administrator directory.', async () => {
      const rows = await db.rows<any>(db.from('admins').select('*').order('email'));
      return { admins: rows };
    }),
  },
});
