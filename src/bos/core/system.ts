import type { PermissionKey } from './authz';

/**
 * The 19 BOS surfaces map one-to-one onto the 19 existing admin screens.
 * Each system declares its actions, the permission each action requires, and
 * the handler. The HTTP layer is generic; authorization can never be bypassed
 * by calling an action the caller did not discover.
 */
export type BosSystemId =
  | 'executive'
  | 'control'
  | 'health'
  | 'catalog'
  | 'collections'
  | 'categories'
  | 'media'
  | 'orders'
  | 'inventory'
  | 'pricing'
  | 'customers'
  | 'waitlist'
  | 'suggestions'
  | 'content'
  | 'analytics'
  | 'advisor'
  | 'channels'
  | 'governance'
  | 'settings';

export interface BosActor {
  id: string;
  email: string;
  role: string;
}

export interface BosContext {
  actor: BosActor;
  requestId: string;
  /** Set when a sensitive action has an approved control-plane record. */
  approvalId?: string;
}

export type BosInput = Record<string, unknown>;

export interface BosAction {
  permission: PermissionKey;
  description: string;
  handler: (ctx: BosContext, input: BosInput) => Promise<unknown>;
}

export interface BosSystem {
  id: BosSystemId;
  /** Position in the admin navigation, 1-based. */
  index: number;
  name: string;
  /** Existing screen this system powers. */
  screen: string;
  description: string;
  actions: Record<string, BosAction>;
}

export function defineSystem(system: BosSystem): BosSystem {
  return system;
}

export function action(
  permission: PermissionKey,
  description: string,
  handler: BosAction['handler']
): BosAction {
  return { permission, description, handler };
}
