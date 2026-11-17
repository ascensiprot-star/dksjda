/**
 * Money is stored and calculated in integer minor units.
 *
 * Existing catalogue and order columns use floating-point euros for backwards
 * compatibility. New code never performs arithmetic on those floats; it
 * converts at the boundary and returns minor units with an explicit currency.
 */
export type CurrencyCode = string;

export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

export const DEFAULT_CURRENCY = 'EUR';
export const DEFAULT_VAT_RATE = 24;

export function toMinor(amount: number, currency: CurrencyCode = DEFAULT_CURRENCY): Money {
  if (!Number.isFinite(amount)) {
    throw new Error('Amount must be a finite number.');
  }
  return { amountMinor: Math.round(amount * 100), currency };
}

export function fromMinor(minor: number): number {
  return Math.round(minor) / 100;
}

export function formatMinor(minor: number, currency: CurrencyCode = DEFAULT_CURRENCY): string {
  const value = fromMinor(minor);
  try {
    return new Intl.NumberFormat('en-FI', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

export interface PricedLine {
  quantity: number;
  unitPriceMinor: number;
  discountMinor?: number;
}

export interface OrderTotals {
  subtotalMinor: number;
  discountMinor: number;
  shippingMinor: number;
  vatMinor: number;
  totalMinor: number;
  currency: CurrencyCode;
}

export interface TotalsInput {
  lines: PricedLine[];
  shippingMinor?: number;
  orderDiscountMinor?: number;
  /** VAT is included in listed prices, matching the storefront. */
  vatRatePercent?: number;
  currency?: CurrencyCode;
}

/**
 * Server-authoritative order totals.
 *
 * subtotal = Σ(quantity × unit price − line discount)
 * taxable  = subtotal − order discount
 * vat      = taxable × rate / (100 + rate)   (VAT-inclusive pricing)
 * total    = taxable + shipping
 */
export function computeOrderTotals(input: TotalsInput): OrderTotals {
  const currency = input.currency || DEFAULT_CURRENCY;
  const vatRate = input.vatRatePercent ?? DEFAULT_VAT_RATE;
  const shippingMinor = Math.max(0, Math.round(input.shippingMinor ?? 0));
  const requestedDiscount = Math.max(0, Math.round(input.orderDiscountMinor ?? 0));

  if (!Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
    throw new Error('VAT rate must be between 0 and 100.');
  }

  let subtotalMinor = 0;
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
      throw new Error('Each line quantity must be a positive integer.');
    }
    if (!Number.isInteger(line.unitPriceMinor) || line.unitPriceMinor < 0) {
      throw new Error('Each line price must be a non-negative integer in minor units.');
    }
    const lineDiscount = Math.max(0, Math.round(line.discountMinor ?? 0));
    const gross = line.quantity * line.unitPriceMinor;
    if (lineDiscount > gross) {
      throw new Error('A line discount cannot exceed the line value.');
    }
    subtotalMinor += gross - lineDiscount;
  }

  if (requestedDiscount > subtotalMinor) {
    throw new Error('An order discount cannot exceed the subtotal.');
  }

  const taxableMinor = subtotalMinor - requestedDiscount;
  const vatMinor = Math.round((taxableMinor * vatRate) / (100 + vatRate));
  const totalMinor = taxableMinor + shippingMinor;

  return {
    subtotalMinor,
    discountMinor: requestedDiscount,
    shippingMinor,
    vatMinor,
    totalMinor,
    currency,
  };
}

/** Converts a stored `totals` JSON document to minor units defensively. */
export function totalsFromLegacy(totals: unknown): OrderTotals {
  const raw = (totals && typeof totals === 'object' ? totals : {}) as Record<string, unknown>;
  const read = (key: string) => {
    const value = Number(raw[key] ?? 0);
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  };
  return {
    subtotalMinor: read('subtotal'),
    discountMinor: read('discount'),
    shippingMinor: read('shipping'),
    vatMinor: read('vat'),
    totalMinor: read('total'),
    currency: DEFAULT_CURRENCY,
  };
}

/** Applies a percentage discount without floating-point drift. */
export function percentageDiscountMinor(baseMinor: number, percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  const clamped = Math.min(100, percent);
  return Math.round((baseMinor * clamped) / 100);
}

export function sumMinor(values: number[]): number {
  return values.reduce((sum, value) => sum + (Number.isFinite(value) ? Math.round(value) : 0), 0);
}
