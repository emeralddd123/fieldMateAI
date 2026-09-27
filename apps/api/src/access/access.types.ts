import type { Request } from 'express';
import type { AuthContext } from '../auth/auth.types';

export type UserRole = 'technician' | 'supervisor' | 'admin';

export interface AccessUser {
  id: string;
  name: string;
  email: string;
}

export interface AccessOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface AccessSite {
  id: string;
  name: string;
  code: string;
}

export interface AccessContext {
  readonly user: AccessUser;
  readonly membershipId: string;
  readonly organization: AccessOrganization;
  readonly role: UserRole;
  readonly allSites: boolean;
  readonly siteIds: string[];
  readonly sites: AccessSite[];

  hasSite(siteId: string): boolean;
  assertSite(siteId: string): void;
  assertRole(allowedRoles: UserRole[]): void;
}

export type RequestWithAccess = Request & {
  auth: AuthContext;
  access: AccessContext;
};
