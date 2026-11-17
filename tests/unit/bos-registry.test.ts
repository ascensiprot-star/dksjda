import { describe, expect, it } from 'vitest';
import { BOS_SYSTEMS, systemManifest, validateRegistry } from '../../src/bos/registry';

describe('BOS registry', () => {
  it('contains exactly the 19 existing admin surfaces', () => {
    expect(BOS_SYSTEMS).toHaveLength(19);
    const ids = BOS_SYSTEMS.map((system) => system.id).sort();
    expect(ids).toEqual(
      [
        'executive',
        'control',
        'health',
        'catalog',
        'collections',
        'categories',
        'media',
        'orders',
        'inventory',
        'pricing',
        'customers',
        'waitlist',
        'suggestions',
        'content',
        'analytics',
        'advisor',
        'channels',
        'governance',
        'settings',
      ].sort()
    );
  });

  it('has unique indexes and valid action keys', () => {
    expect(validateRegistry()).toEqual([]);
    const indexes = BOS_SYSTEMS.map((system) => system.index).sort((a, b) => a - b);
    expect(indexes).toEqual(Array.from({ length: 19 }, (_, index) => index + 1));
  });

  it('declares a permission for every action', () => {
    for (const system of BOS_SYSTEMS) {
      for (const [key, action] of Object.entries(system.actions)) {
        expect(action.permission, `${system.id}.${key}`).toMatch(/^[a-z]+\.[a-z]+$/);
        expect(action.description.length, `${system.id}.${key}`).toBeGreaterThan(5);
      }
    }
  });

  it('exposes order fulfilment and returns under the orders system', () => {
    const orders = BOS_SYSTEMS.find((system) => system.id === 'orders')!;
    expect(orders.actions.shipmentDispatch).toBeDefined();
    expect(orders.actions.returnRefund).toBeDefined();
    expect(orders.actions.transition).toBeDefined();
  });

  it('produces a manifest without leaking handler functions', () => {
    const manifest = systemManifest();
    expect(manifest).toHaveLength(19);
    expect(JSON.stringify(manifest)).not.toContain('handler');
  });
});
