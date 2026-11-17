import { supabase } from './config';
import type { AccountAddress, AccountOverview, AccountUser } from '../types';

async function authHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error('Your session has expired. Please sign in again.');
  }
  return {
    Authorization: `Bearer ${data.session.access_token}`,
    'Content-Type': 'application/json',
  };
}

export async function fetchAccountOverview(): Promise<AccountOverview> {
  const response = await fetch('/api/account/overview', {
    method: 'GET',
    headers: await authHeaders(),
    credentials: 'same-origin',
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Could not load account details.');
  }
  return payload as AccountOverview;
}

export interface AccountProfileInput {
  fullName: string;
  phone: string;
  address: AccountAddress;
  marketingConsent: boolean;
}

export async function saveAccountProfile(
  input: AccountProfileInput
): Promise<{ user: AccountUser }> {
  const response = await fetch('/api/account/profile', {
    method: 'PATCH',
    headers: await authHeaders(),
    credentials: 'same-origin',
    body: JSON.stringify(input),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Could not save account profile.');
  }
  return payload as { user: AccountUser };
}
