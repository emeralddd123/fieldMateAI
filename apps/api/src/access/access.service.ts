import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthContext } from '../auth/auth.types';
import type { AccessContext, AccessSite } from './access.types';
import { UserAccessContext } from './access-context';

@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAccess(
    auth: AuthContext,
    requestedOrgId?: string,
  ): Promise<AccessContext> {
    if (!auth.memberships || auth.memberships.length === 0) {
      throw new ForbiddenException({
        code: 'NO_ACTIVE_MEMBERSHIP',
        message: 'No active organization membership found.',
      });
    }

    const membership = requestedOrgId
      ? auth.memberships.find((m) => m.organization.id === requestedOrgId)
      : auth.memberships[0];

    if (!membership) {
      throw new ForbiddenException({
        code: 'ORGANIZATION_ACCESS_DENIED',
        message: 'You do not belong to the requested organization.',
      });
    }

    let allSites = false;
    let sites: AccessSite[] = membership.sites;

    if (membership.role === 'admin') {
      allSites = true;
      const orgSites = await this.prisma.site.findMany({
        where: {
          organizationId: membership.organization.id,
          archivedAt: null,
        },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      });
      sites = orgSites;
    }

    return new UserAccessContext({
      user: auth.user,
      membershipId: membership.id,
      organization: membership.organization,
      role: membership.role,
      allSites,
      sites,
    });
  }
}
