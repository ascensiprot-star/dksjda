import { badRequest } from './errors';

export function stringField(
  input: Record<string, unknown>,
  key: string,
  options: { required?: boolean; max?: number; min?: number; trim?: boolean } = {}
): string {
  const raw = input[key];
  const value = typeof raw === 'string' ? (options.trim === false ? raw : raw.trim()) : '';
  if (!value && options.required) throw badRequest(`${key} is required.`);
  if (options.min && value.length < options.min) {
    throw badRequest(`${key} must be at least ${options.min} characters.`);
  }
  if (options.max && value.length > options.max) {
    throw badRequest(`${key} must be at most ${options.max} characters.`);
  }
  return value;
}

export function optionalString(
  input: Record<string, unknown>,
  key: string,
  max = 5000
): string | undefined {
  if (input[key] === undefined || input[key] === null) return undefined;
  const value = String(input[key]).trim();
  if (value.length > max) throw badRequest(`${key} is too long.`);
  return value || undefined;
}

export function intField(
  input: Record<string, unknown>,
  key: string,
  options: { required?: boolean; min?: number; max?: number; fallback?: number } = {}
): number {
  const raw = input[key];
  if (raw === undefined || raw === null || raw === '') {
    if (options.required) throw badRequest(`${key} is required.`);
    return options.fallback ?? 0;
  }
  const value = Number(raw);
  if (!Number.isInteger(value)) throw badRequest(`${key} must be an integer.`);
  if (options.min !== undefined && value < options.min) {
    throw badRequest(`${key} must be at least ${options.min}.`);
  }
  if (options.max !== undefined && value > options.max) {
    throw badRequest(`${key} must be at most ${options.max}.`);
  }
  return value;
}

export function moneyMinorField(
  input: Record<string, unknown>,
  key: string,
  options: { required?: boolean; min?: number } = {}
): number {
  return intField(input, key, { required: options.required, min: options.min ?? 0 });
}

export function boolField(
  input: Record<string, unknown>,
  key: string,
  fallback = false
): boolean {
  const raw = input[key];
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true' || raw === 1 || raw === '1') return true;
  if (raw === 'false' || raw === 0 || raw === '0') return false;
  throw badRequest(`${key} must be a boolean.`);
}

export function enumField<T extends string>(
  input: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  options: { required?: boolean; fallback?: T } = {}
): T {
  const raw = input[key];
  if (raw === undefined || raw === null || raw === '') {
    if (options.fallback !== undefined) return options.fallback;
    if (options.required) throw badRequest(`${key} is required.`);
    throw badRequest(`${key} is required.`);
  }
  const value = String(raw);
  if (!allowed.includes(value as T)) {
    throw badRequest(`${key} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

export function emailField(input: Record<string, unknown>, key = 'email'): string {
  const value = stringField(input, key, { required: true, max: 254 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    throw badRequest('A valid email address is required.');
  }
  return value;
}

export function arrayField(
  input: Record<string, unknown>,
  key: string,
  options: { required?: boolean; max?: number } = {}
): unknown[] {
  const raw = input[key];
  if (raw === undefined || raw === null) {
    if (options.required) throw badRequest(`${key} is required.`);
    return [];
  }
  if (!Array.isArray(raw)) throw badRequest(`${key} must be an array.`);
  if (options.max && raw.length > options.max) {
    throw badRequest(`${key} must contain at most ${options.max} entries.`);
  }
  return raw;
}

export function isoDateField(
  input: Record<string, unknown>,
  key: string,
  options: { required?: boolean } = {}
): string | undefined {
  const value = optionalString(input, key, 40);
  if (!value) {
    if (options.required) throw badRequest(`${key} is required.`);
    return undefined;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw badRequest(`${key} must be an ISO-8601 date.`);
  return new Date(parsed).toISOString();
}

export function pagination(input: Record<string, unknown>): { limit: number; offset: number } {
  const limit = intField(input, 'limit', { min: 1, max: 500, fallback: 50 });
  const offset = intField(input, 'offset', { min: 0, fallback: 0 });
  return { limit, offset };
}
