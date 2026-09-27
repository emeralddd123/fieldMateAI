const baseUrl = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(
  /\/$/,
  '',
);

export type UserRole = 'technician' | 'supervisor' | 'admin';

export interface AuthSession {
  sessionId: string;
  expiresAt: string;
  user: { id: string; name: string; email: string };
  memberships: Array<{
    id: string;
    role: UserRole;
    organization: { id: string; name: string; slug: string };
    sites: Array<{ id: string; name: string; code: string }>;
  }>;
}

export class AuthApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}/auth${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new AuthApiError(
      body?.error?.message ?? 'The authentication request failed.',
      response.status,
      body?.error?.code,
    );
  }
  return (await response.json()).data;
}

export async function fetchCurrentSession() {
  try {
    return await authRequest<AuthSession>('/me');
  } catch (error) {
    if (error instanceof AuthApiError && error.status === 401) return null;
    throw error;
  }
}

export function login(email: string, password: string) {
  return authRequest<AuthSession>('/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logout(all = false) {
  return authRequest<{ loggedOut: boolean }>(all ? '/logout-all' : '/logout', {
    method: 'POST',
  });
}

export function changePassword(currentPassword: string, newPassword: string) {
  return authRequest<AuthSession>('/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function acceptInvitation(token: string, password: string) {
  return authRequest<AuthSession>(`/invitations/${token}/accept`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function requestPasswordReset(email: string) {
  return authRequest<{ accepted: true; resetToken?: string }>(
    '/password-reset/request',
    { method: 'POST', body: JSON.stringify({ email }) },
  );
}

export function resetPassword(token: string, password: string) {
  return authRequest<AuthSession>(`/password-reset/${token}`, {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}
