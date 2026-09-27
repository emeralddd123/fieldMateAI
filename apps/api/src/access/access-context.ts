import { ForbiddenException } from '@nestjs/common';
import type {
  AccessContext,
  AccessOrganization,
  AccessSite,
  AccessUser,
  UserRole,
} from './access.types';

export interface UserAccessContextOptions {
  user: AccessUser;
  membershipId: string;
  organization: AccessOrganization;
  role: UserRole;
  allSites: boolean;
  sites: AccessSite[];
}

export class UserAccessContext implements AccessContext {
  readonly user: AccessUser;
  readonly membershipId: string;
  readonly organization: AccessOrganization;
  readonly role: UserRole;
  readonly allSites: boolean;
  readonly sites: AccessSite[];
  readonly siteIds: string[];

  constructor(options: UserAccessContextOptions) {
    this.user = options.user;
    this.membershipId = options.membershipId;
    this.organization = options.organization;
    this.role = options.role;
    this.allSites = options.allSites;
    this.sites = options.sites;
    this.siteIds = options.sites.map((s) => s.id);
  }

  hasSite(siteId: string): boolean {
    if (this.allSites) return true;
    return this.siteIds.includes(siteId);
  }

  assertSite(siteId: string): void {
    if (!this.hasSite(siteId)) {
      throw new ForbiddenException({
        code: 'SITE_ACCESS_DENIED',
        message: 'You do not have access to this site.',
      });
    }
  }

  assertRole(allowedRoles: UserRole[]): void {
    if (!allowedRoles.includes(this.role)) {
      throw new ForbiddenException({
        code: 'INSUFFICIENT_PERMISSIONS',
        message: 'You do not have permission to perform this action.',
      });
    }
  }
}
