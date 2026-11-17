import type { BosSystem, BosSystemId } from './core/system';
import { executiveSystem } from './systems/executive';
import { controlSystem } from './systems/control';
import { healthSystem } from './systems/health';
import { catalogSystem } from './systems/catalog';
import { collectionsSystem } from './systems/collections';
import { categoriesSystem } from './systems/categories';
import { mediaSystem } from './systems/media';
import { ordersSystem } from './systems/orders';
import { fulfillmentActions } from './systems/fulfillment';
import { returnsActions } from './systems/returns';
import { inventorySystem } from './systems/inventory';
import { pricingSystem } from './systems/pricing';
import { customersSystem } from './systems/customers';
import { waitlistSystem } from './systems/waitlist';
import { suggestionsSystem } from './systems/suggestions';
import { contentSystem } from './systems/content';
import { analyticsSystem } from './systems/analytics';
import { advisorSystem } from './systems/advisor';
import { channelsSystem } from './systems/channels';
import { governanceSystem } from './systems/governance';
import { settingsSystem } from './systems/settings';
import { financeActions } from './systems/finance';
import { supplierActions } from './systems/suppliers';
import { loyaltyActions } from './systems/loyalty';
import { supportActions } from './systems/support';
import { reviewActions } from './systems/reviews';
import { marketingActions } from './systems/marketing';

/**
 * The order screen owns order operations, fulfilment and returns. Keeping them
 * as one system preserves a single permission boundary and a single audit
 * target while the UI stays on one screen.
 */
const orderOperations: BosSystem = {
  ...ordersSystem,
  actions: {
    ...ordersSystem.actions,
    ...fulfillmentActions,
    ...returnsActions,
  },
};

const analyticsOperations: BosSystem = {
  ...analyticsSystem,
  actions: { ...analyticsSystem.actions, ...financeActions },
};

const inventoryOperations: BosSystem = {
  ...inventorySystem,
  actions: { ...inventorySystem.actions, ...supplierActions },
};

const customerOperations: BosSystem = {
  ...customersSystem,
  actions: { ...customersSystem.actions, ...loyaltyActions, ...supportActions },
};

const contentOperations: BosSystem = {
  ...contentSystem,
  actions: { ...contentSystem.actions, ...reviewActions },
};

const channelOperations: BosSystem = {
  ...channelsSystem,
  actions: { ...channelsSystem.actions, ...marketingActions },
};

export const BOS_SYSTEMS: readonly BosSystem[] = [
  executiveSystem,
  controlSystem,
  healthSystem,
  catalogSystem,
  collectionsSystem,
  categoriesSystem,
  mediaSystem,
  orderOperations,
  inventoryOperations,
  pricingSystem,
  customerOperations,
  waitlistSystem,
  suggestionsSystem,
  contentOperations,
  analyticsOperations,
  advisorSystem,
  channelOperations,
  governanceSystem,
  settingsSystem,
];

export const BOS_SYSTEM_MAP = new Map<string, BosSystem>(
  BOS_SYSTEMS.map((system) => [system.id, system])
);

export function getSystem(id: string): BosSystem | undefined {
  return BOS_SYSTEM_MAP.get(id);
}

export function systemManifest() {
  return BOS_SYSTEMS.map((system) => ({
    id: system.id,
    index: system.index,
    name: system.name,
    screen: system.screen,
    description: system.description,
    actions: Object.entries(system.actions).map(([key, value]) => ({
      action: key,
      permission: value.permission,
      description: value.description,
    })),
  }));
}

/** Validates the registry at import time so a misconfigured deploy fails fast. */
export function validateRegistry(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const indexes = new Set<number>();
  for (const system of BOS_SYSTEMS) {
    if (ids.has(system.id)) errors.push(`Duplicate system id: ${system.id}`);
    ids.add(system.id);
    if (indexes.has(system.index)) errors.push(`Duplicate system index: ${system.index}`);
    indexes.add(system.index);
    if (!Object.keys(system.actions).length) errors.push(`System ${system.id} has no actions.`);
    for (const [key, value] of Object.entries(system.actions)) {
      if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(key)) errors.push(`Invalid action key: ${system.id}.${key}`);
      if (!value.permission) errors.push(`Action ${system.id}.${key} has no permission.`);
    }
  }
  if (BOS_SYSTEMS.length !== 19) errors.push(`Expected 19 systems, found ${BOS_SYSTEMS.length}.`);
  return errors;
}

export type { BosSystem, BosSystemId };
