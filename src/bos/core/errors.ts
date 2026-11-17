/**
 * BOS shared error type.
 *
 * Errors carry an HTTP status and a stable machine code so API clients can
 * react without parsing prose. No stack trace, SQL text or secret ever leaves
 * the server in `message`.
 */
export class BosError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'BosError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: Record<string, unknown>) =>
  new BosError('invalid_request', message, 400, details);

export const unauthorized = (message = 'Authentication required.') =>
  new BosError('unauthorized', message, 401);

export const forbidden = (message = 'You do not have permission for this action.') =>
  new BosError('forbidden', message, 403);

export const notFound = (message = 'Not found.') => new BosError('not_found', message, 404);

export const conflict = (message: string, details?: Record<string, unknown>) =>
  new BosError('conflict', message, 409, details);

export const schemaUnavailable = (message = 'This capability requires a pending database migration.') =>
  new BosError('schema_unavailable', message, 503);

export const unavailable = (message = 'The service is temporarily unavailable.') =>
  new BosError('unavailable', message, 503);

/** Maps PostgREST/Postgres failures onto safe, stable BOS errors. */
export function mapDatabaseError(error: unknown): BosError {
  const raw = error as { code?: string; message?: string; details?: string } | null;
  const message = String(raw?.message || '');
  const code = String(raw?.code || '');

  if (code === '42P01' || code === 'PGRST205' || /does not exist|schema cache/i.test(message)) {
    return schemaUnavailable();
  }
  if (code === '23505' || /duplicate key/i.test(message)) {
    return conflict('A record with this identity already exists.');
  }
  if (code === '23503' || /foreign key/i.test(message)) {
    return badRequest('A referenced record does not exist.');
  }
  if (code === '23514' || /check constraint/i.test(message)) {
    return badRequest('The value violates a business constraint.');
  }
  if (/insufficient_stock/i.test(message)) {
    return conflict('There is not enough stock to complete this operation.', {
      reason: 'insufficient_stock',
    });
  }
  if (/append-only/i.test(message)) {
    return conflict('This ledger is append-only. Record a correcting entry instead.');
  }
  return new BosError('database_error', 'The database operation failed.', 500);
}
