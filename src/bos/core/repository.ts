import { supabase } from '../../supabase/config';
import { BosError, mapDatabaseError, notFound } from './errors';

/**
 * Thin, explicit database boundary.
 *
 * Supabase's query builder is intentionally untyped at this seam because the
 * BOS spans several schemas that are introduced by migrations. Every call
 * funnels failures through `mapDatabaseError` so no raw SQL message or code is
 * exposed to a client.
 */
export const db = {
  from(table: string) {
    return supabase.from(table) as any;
  },

  async rows<T>(builder: any): Promise<T[]> {
    const { data, error } = await builder;
    if (error) throw mapDatabaseError(error);
    return (Array.isArray(data) ? data : data ? [data] : []) as T[];
  },

  async one<T>(builder: any): Promise<T | null> {
    const { data, error } = await builder;
    if (error) throw mapDatabaseError(error);
    return (data ?? null) as T | null;
  },

  async required<T>(builder: any, message = 'The requested record does not exist.'): Promise<T> {
    const row = await this.one<T>(builder);
    if (!row) throw notFound(message);
    return row;
  },

  async write<T>(builder: any): Promise<T | null> {
    const { data, error } = await builder;
    if (error) throw mapDatabaseError(error);
    if (Array.isArray(data)) return (data[0] ?? null) as T | null;
    return (data ?? null) as T | null;
  },

  async count(builder: any): Promise<number> {
    const { count, error } = await builder;
    if (error) throw mapDatabaseError(error);
    return Number(count || 0);
  },

  async rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await (supabase.rpc as any)(name, args);
    if (error) throw mapDatabaseError(error);
    return data as T;
  },
};

/** Reads a numeric field that may arrive as string, number or null. */
export function numeric(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function intOrZero(value: unknown): number {
  return Math.trunc(numeric(value, 0));
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function windowStartIso(days: number): string {
  return new Date(Date.now() - Math.max(0, days) * 86_400_000).toISOString();
}

/**
 * Reads an optional projection that may not exist until a migration is applied.
 * Write paths never use this: a missing schema must fail a mutation loudly.
 */
export async function optionalRows<T>(builder: any): Promise<T[]> {
  try {
    return await db.rows<T>(builder);
  } catch (error) {
    if (error instanceof BosError && error.code === 'schema_unavailable') return [];
    throw error;
  }
}
