import { supabase } from '../supabase/config';

export class BosClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BosClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/**
 * Authenticated BOS client used by existing admin screens.
 * The session token is attached server-side; no service key ever reaches the
 * browser and no screen invents a fake success response.
 */
export async function bosFetch<T>(
  system: string,
  action: string,
  input: Record<string, unknown> = {},
  init: RequestInit = {}
): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new BosClientError('No active operator session. Sign in again.', 'unauthorized', 401);
  }
  const response = await fetch(`/api/bos/${encodeURIComponent(system)}/${encodeURIComponent(action)}`, {
    ...init,
    method: init.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
    body: init.body ?? JSON.stringify(input),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new BosClientError(
      payload?.error || `The operation failed (HTTP ${response.status}).`,
      payload?.code || 'request_failed',
      response.status,
      payload?.details
    );
  }
  return payload.data as T;
}
