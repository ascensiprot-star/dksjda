import { db } from './repository';
import { conflict, badRequest } from './errors';
import { stableHash } from './ids';

export interface IdempotencyResult<T = unknown> {
  replay: boolean;
  response: T | null;
}

/**
 * Claims an idempotency key before a mutation.
 *
 * The composite primary key `(key, scope)` makes the claim atomic. A retry
 * returns the stored response; a concurrent in-flight request is rejected
 * instead of running the mutation twice.
 */
export async function claimIdempotency(
  key: string | undefined,
  scope: string,
  request: unknown
): Promise<IdempotencyResult> {
  if (!key) return { replay: false, response: null };
  if (!/^[A-Za-z0-9._:-]{8,160}$/.test(key)) {
    throw badRequest('Idempotency-Key must be 8-160 characters of [A-Za-z0-9._:-].');
  }

  const requestHash = stableHash(request);
  const existing = await db.one<{
    status: string;
    response: unknown;
    request_hash: string | null;
  }>(
    db
      .from('idempotency_keys')
      .select('status, response, request_hash')
      .eq('key', key)
      .eq('scope', scope)
      .maybeSingle()
  );

  if (existing) {
    if (existing.request_hash && existing.request_hash !== requestHash) {
      throw conflict('This idempotency key was already used for a different request.');
    }
    if (existing.status === 'completed') {
      return { replay: true, response: existing.response ?? null };
    }
    if (existing.status === 'in_progress') {
      throw conflict('A request with this idempotency key is already in progress.');
    }
    throw conflict('This idempotency key belongs to a failed request. Use a new key.');
  }

  const { error } = await db
    .from('idempotency_keys')
    .insert({ key, scope, request_hash: requestHash, status: 'in_progress' });
  if (error) {
    const race = await db.one<{ status: string; response: unknown }>(
      db
        .from('idempotency_keys')
        .select('status, response')
        .eq('key', key)
        .eq('scope', scope)
        .maybeSingle()
    );
    if (race?.status === 'completed') {
      return { replay: true, response: race.response ?? null };
    }
    throw conflict('A request with this idempotency key is already in progress.');
  }

  return { replay: false, response: null };
}

export async function completeIdempotency(
  key: string | undefined,
  scope: string,
  response: unknown
): Promise<void> {
  if (!key) return;
  await db
    .from('idempotency_keys')
    .update({
      status: 'completed',
      response,
      completed_at: new Date().toISOString(),
    })
    .eq('key', key)
    .eq('scope', scope);
}

export async function failIdempotency(
  key: string | undefined,
  scope: string,
  error: string
): Promise<void> {
  if (!key) return;
  await db
    .from('idempotency_keys')
    .update({
      status: 'failed',
      error: error.slice(0, 500),
      completed_at: new Date().toISOString(),
    })
    .eq('key', key)
    .eq('scope', scope);
}
