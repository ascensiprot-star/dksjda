import { percentageDiscountMinor } from './money';

export interface DiscountRule {
  code: string;
  type: string;
  value: number;
  minSpendMinor: number;
  usageLimit: number;
  used: number;
  startAt?: string | null;
  endAt?: string | null;
  active: boolean;
}

export interface DiscountEvaluation {
  valid: boolean;
  reason?: string;
  discountMinor: number;
  freeShipping: boolean;
  code: string;
}

/**
 * Pure server-side discount evaluation. The browser never decides a price.
 * `used` is checked at quote time and re-checked atomically at redemption.
 */
export function evaluateDiscount(
  rule: DiscountRule | null,
  subtotalMinor: number,
  shippingMinor: number,
  now = new Date()
): DiscountEvaluation {
  if (!rule) {
    return { valid: false, reason: 'unknown_code', discountMinor: 0, freeShipping: false, code: '' };
  }
  const code = rule.code;
  if (!rule.active) {
    return { valid: false, reason: 'inactive', discountMinor: 0, freeShipping: false, code };
  }
  if (rule.startAt && Date.parse(rule.startAt) > now.getTime()) {
    return { valid: false, reason: 'not_started', discountMinor: 0, freeShipping: false, code };
  }
  if (rule.endAt && Date.parse(rule.endAt) < now.getTime()) {
    return { valid: false, reason: 'expired', discountMinor: 0, freeShipping: false, code };
  }
  if (rule.usageLimit > 0 && rule.used >= rule.usageLimit) {
    return { valid: false, reason: 'usage_limit_reached', discountMinor: 0, freeShipping: false, code };
  }
  if (subtotalMinor < rule.minSpendMinor) {
    return {
      valid: false,
      reason: 'min_spend_not_met',
      discountMinor: 0,
      freeShipping: false,
      code,
    };
  }

  if (rule.type === 'freeShipping') {
    return { valid: true, discountMinor: 0, freeShipping: true, code };
  }
  if (rule.type === 'percent') {
    return {
      valid: true,
      discountMinor: percentageDiscountMinor(subtotalMinor, rule.value),
      freeShipping: false,
      code,
    };
  }
  if (rule.type === 'fixed') {
    const fixedMinor = Math.round(Math.max(0, rule.value) * 100);
    return {
      valid: true,
      discountMinor: Math.min(subtotalMinor, fixedMinor),
      freeShipping: false,
      code,
    };
  }
  return { valid: false, reason: 'unsupported_type', discountMinor: 0, freeShipping: false, code };
}
