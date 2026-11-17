import { createHash, randomUUID } from 'crypto';

const PREFIX_PATTERN = /^[a-z][a-z0-9_-]{1,23}$/i;

/** Opaque, prefixed identifiers. Never derived from Math.random. */
export function bosId(prefix: string): string {
  const safePrefix = PREFIX_PATTERN.test(prefix) ? prefix.toLowerCase() : 'bos';
  return `${safePrefix}_${randomUUID().replace(/-/g, '')}`;
}

export function orderNumber(now = new Date()): string {
  const year = now.getUTCFullYear();
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `ZE-${year}-${suffix}`;
}

/** Deterministic customer key, matching the existing checkout convention. */
export function customerIdFromEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return '';
  return normalized.replace(/[^a-z0-9]/g, '_');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function stableHash(value: unknown): string {
  return sha256(stableStringify(value));
}

/** JSON with sorted object keys, so hashes are stable across calls. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
