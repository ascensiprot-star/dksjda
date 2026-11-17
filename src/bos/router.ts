import express from 'express';
import { assertPermission, hasPermission, requiresApproval, normalizeRole } from './core/authz';
import { BosError } from './core/errors';
import { getSystem, systemManifest, validateRegistry } from './registry';
import { db } from './core/repository';
import type { BosActor, BosContext, BosInput } from './core/system';

interface AdminRequest extends express.Request {
  admin?: { id: string; email: string; role: string };
  requestId?: string;
}

function actorOf(req: AdminRequest): BosActor | null {
  const admin = req.admin;
  if (!admin?.email) return null;
  return { id: admin.id || admin.email, email: admin.email, role: normalizeRole(admin.role) };
}

async function approvalIsValid(
  approvalId: string | undefined,
  systemId: string,
  actionKey: string
): Promise<boolean> {
  if (!approvalId) return false;
  const row = await db.one<{
    id: string;
    action: string;
    target_type: string;
    status: string;
    expires_at?: string | null;
  }>(
    db
      .from('system_change_requests')
      .select('id, action, target_type, status, expires_at')
      .eq('id', approvalId)
      .maybeSingle()
  );
  if (!row || row.status !== 'approved') return false;
  if (row.expires_at && Date.parse(row.expires_at) < Date.now()) return false;
  return row.action === `bos.${systemId}.${actionKey}` || row.action === `${systemId}.${actionKey}`;
}

/**
 * Authenticated BOS API.
 *
 * A single dispatcher is used so every action is registered with an explicit
 * permission. There is no reflection over object properties and no way to call
 * an undeclared operation.
 */
export function createBosRouter(): express.Router {
  const router = express.Router();

  router.get('/manifest', (req, res) => {
    const actor = actorOf(req as AdminRequest);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required.', code: 'unauthorized' });
      return;
    }
    const errors = validateRegistry();
    const systems = systemManifest().map((system) => ({
      ...system,
      actions: system.actions.filter((entry) => hasPermission(actor.role, entry.permission as any)),
    }));
    res.json({
      version: 1,
      systems,
      hiddenActions: systemManifest()
        .flatMap((system) => system.actions)
        .filter((entry) => !hasPermission(actor.role, entry.permission as any)).length,
      registryErrors: errors,
      actor: { email: actor.email, role: actor.role },
    });
  });

  router.all('/:system/:action', async (req, res) => {
    const request = req as AdminRequest;
    const actor = actorOf(request);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required.', code: 'unauthorized' });
      return;
    }
    const system = getSystem(String(req.params.system));
    const actionKey = String(req.params.action);
    const entry = system?.actions[actionKey];
    if (!system || !entry) {
      res.status(404).json({ error: 'Unknown BOS action.', code: 'not_found' });
      return;
    }

    try {
      assertPermission(actor.role, entry.permission);
      const input: BosInput =
        req.method === 'GET'
          ? ({ ...req.query } as BosInput)
          : (req.body && typeof req.body === 'object' && !Array.isArray(req.body)
              ? (req.body as BosInput)
              : {});

      if (requiresApproval(entry.permission) && actor.role !== 'owner') {
        const approvalId = String((input as Record<string, unknown>).approvalId || '');
        if (!(await approvalIsValid(approvalId, system.id, actionKey))) {
          throw new BosError(
            'approval_required',
            'This action requires an approved change request.',
            403,
            { approvalId: approvalId || null }
          );
        }
      }

      const ctx: BosContext = {
        actor,
        requestId: request.requestId || 'unknown',
        approvalId: (input as Record<string, unknown>).approvalId
          ? String((input as Record<string, unknown>).approvalId)
          : undefined,
      };
      const result = await entry.handler(ctx, input);
      res.json({ ok: true, system: system.id, action: actionKey, data: result });
    } catch (error) {
      if (error instanceof BosError) {
        res.status(error.status).json({
          error: error.message,
          code: error.code,
          details: error.details,
          requestId: request.requestId,
        });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[bos] ${system.id}.${actionKey} failed:`, message);
      res.status(500).json({
        error: 'The operation failed. Nothing was silently ignored.',
        code: 'internal_error',
        requestId: request.requestId,
      });
    }
  });

  return router;
}
