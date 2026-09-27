import type { Request } from 'express';

export interface AuthSite {
  id: string;
  name: string;
  code: string;
}

export interface AuthMembership {
  id: string;
  role: 'technician' | 'supervisor' | 'admin';
  organization: { id: string; name: string; slug: string };
  sites: AuthSite[];
}

export interface AuthContext {
  sessionId: string;
  expiresAt: string;
  user: { id: string; name: string; email: string };
  memberships: AuthMembership[];
}

export type AuthenticatedRequest = Request & { auth: AuthContext };
