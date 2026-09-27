# Authentication, RBAC, and administration implementation plan

## Goal

Add production-shaped authentication and authorization to FieldMate, replace seeded demo actors with the signed-in user, and provide an administration workspace for managing users and maintenance master data.

The first release remains self-hostable and supports multiple organizations and sites without adding billing, external identity providers, or email delivery. Those integrations can be added after the authorization boundary is established.

## Current state and gaps

- `UserRole` already defines `technician`, `supervisor`, and `admin`, but the role is stored directly on `User` and is not enforced by guards.
- API routes are public. The frontend switches between technician and supervisor views by URL.
- Maintenance writes attribute work to seeded demo user IDs.
- Sites exist, but users are not assigned to organizations or sites, and queries are not tenant-scoped.
- Assets, fault definitions, procedures, and users have read/demo endpoints but no complete administration API.
- User deactivation, session revocation, invitations, password management, and security audit events do not exist.
- Historical records make destructive deletion unsafe; administration needs archive/deactivate behavior.

## Architecture decisions

### Authentication

Use server-side opaque sessions:

- Email and password login.
- Argon2id password hashes.
- A cryptographically random session token stored only in an `HttpOnly`, `Secure` production cookie with `SameSite=Lax`.
- Store only the SHA-256 hash of the session token in PostgreSQL.
- Sessions have an absolute expiry, a last-seen timestamp, and explicit revocation.
- Rotate the session token after login, password change, and privilege changes.
- Verify `Origin` on state-changing cookie-authenticated requests. Keep the web app and API on the same public origin in production.
- Rate-limit login and invitation acceptance by account and IP.
- Never store credentials or session tokens in `localStorage`.

This design gives administrators immediate session revocation and avoids long-lived bearer tokens in browser storage.

### Account provisioning

- An admin creates an invited user with name, email, organization role, and permitted sites.
- The server creates a single-use, hashed invitation token with an expiry.
- Until email delivery is integrated, the admin UI displays the setup link once so it can be transferred securely.
- Invitation acceptance sets the initial password and activates the account.
- Development and test environments may bootstrap the first admin from environment variables. Production startup must fail or give a setup command when no admin exists; it must never use a hard-coded password.
- Password reset uses the same single-use token pattern. Delivery remains pluggable.

### Authorization boundary

Introduce organizations now so resource ownership cannot leak across customers later:

- A user is a global identity.
- `OrganizationMembership` gives that user one role in an organization.
- `MembershipSiteAccess` limits technicians and supervisors to assigned sites.
- Administrators can access every site in their organization.
- Every request resolves an authenticated user, active organization membership, role, and permitted site IDs.
- Every service query includes the organization/site scope. Controller guards alone are insufficient protection.

The first UI can automatically select the user's only organization. Organization switching can appear when a user belongs to more than one.

### Resource lifecycle

- Users are deactivated, not deleted.
- Sites, assets, components, fault definitions, and procedures are archived when historical records reference them.
- Asset tags become unique inside an organization instead of globally.
- Fault definitions become unique by organization, manufacturer, model, and normalized fault code.
- Procedures are created as drafts. Only an admin can approve or withdraw them.
- Archived or unapproved knowledge must never be returned to the voice troubleshooting tools as approved guidance.

### Auditability

Every authentication and administration mutation writes an immutable audit event containing:

- organization;
- actor user and membership;
- action and resource type/ID;
- timestamp;
- safe before/after metadata;
- request ID, IP, and user agent where available.

Password hashes, session tokens, invitation tokens, API keys, and full secrets are never stored in audit payloads.

## Role and permission matrix

| Capability                                           | Technician | Supervisor | Admin                       |
| ---------------------------------------------------- | ---------- | ---------- | --------------------------- |
| Sign in and manage own password                      | Yes        | Yes        | Yes                         |
| View assigned sites, assets, knowledge, and history  | Yes        | Yes        | Yes, all organization sites |
| Use voice tools and create readings/incidents/notes  | Yes        | Yes        | Yes                         |
| Complete repair for assigned-site incidents          | Yes        | Yes        | Yes                         |
| Escalate an incident                                 | Yes        | Yes        | Yes                         |
| Acknowledge escalation, assign work, change priority | No         | Yes        | Yes                         |
| View supervisor workspace                            | No         | Yes        | Yes                         |
| Invite, edit, deactivate, or reactivate users        | No         | No         | Yes                         |
| Assign roles and site access                         | No         | No         | Yes                         |
| Create or edit sites, machines, and components       | No         | No         | Yes                         |
| Create fault definitions and procedure drafts        | No         | No         | Yes                         |
| Approve or withdraw procedures                       | No         | No         | Yes                         |
| View security/admin audit log                        | No         | No         | Yes                         |

Rules that apply across roles:

- Users can access only their active organization membership and permitted sites.
- Users cannot assign incidents to someone outside the incident's organization/site access.
- The last active admin in an organization cannot be demoted or deactivated.
- An admin cannot deactivate their own account or revoke their current membership without another active admin.
- A disabled user loses all active sessions immediately.

## Data model changes

### Identity and access

Add:

- `Organization`: `id`, `name`, `slug`, timestamps, `archivedAt`.
- `OrganizationMembership`: `id`, `organizationId`, `userId`, `role`, `status`, timestamps, unique organization/user pair.
- `MembershipSiteAccess`: `membershipId`, `siteId`, unique pair.
- `AuthSession`: `id`, `userId`, `tokenHash`, `expiresAt`, `lastSeenAt`, `revokedAt`, IP/user-agent metadata.
- `UserInvite`: `id`, `organizationId`, `email`, `name`, `role`, `tokenHash`, `expiresAt`, `acceptedAt`, `createdById`.
- `PasswordResetToken`: hashed token, user, expiry, used timestamp.
- `AuditEvent`: organization, actor, action, resource, request metadata, JSON details, timestamp.

Change `User`:

- Make `email` required and case-insensitively unique.
- Add `passwordHash`, `status`, `passwordChangedAt`, `lastLoginAt`, and timestamps.
- Move authorization role from `User.role` to `OrganizationMembership.role` after backfill.

### Organization-owned resources

- Add `organizationId` to `Site`.
- Add `organizationId`, `archivedAt`, and optional `retiredAt` to `Asset`; replace the global asset-tag uniqueness constraint with organization/tag uniqueness.
- Add timestamps and `archivedAt` to `Component`.
- Add `organizationId`, normalized fault code, timestamps, and `archivedAt` to `FaultDefinition`.
- Add `organizationId`, `status` (`draft`, `approved`, `withdrawn`), approval actor/time, timestamps, and `archivedAt` to `Procedure`.
- Keep incidents, readings, and maintenance records scoped through their asset. Add direct `organizationId` only if query profiling later shows a concrete need.

### Migration strategy

1. Create the organization and access tables without removing existing fields.
2. Create a default `FieldMate Demo` organization and attach `Plant Alpha` and all existing knowledge/resources.
3. Convert seeded users into memberships with their existing roles and grant Plant Alpha access.
4. Add password/status fields as nullable, bootstrap the first admin, and backfill required values.
5. Update application reads and writes to membership-based authorization.
6. Make required columns non-null and add scoped uniqueness constraints.
7. Remove `User.role` only after every service and test uses memberships.

Migrations must preserve incidents and maintenance history. No reset is permitted for a working environment.

## API design

### Authentication

| Method | Route                                    | Access        | Purpose                                                  |
| ------ | ---------------------------------------- | ------------- | -------------------------------------------------------- |
| `POST` | `/api/v1/auth/login`                     | Public        | Validate credentials and start a session                 |
| `POST` | `/api/v1/auth/logout`                    | Authenticated | Revoke current session and clear cookie                  |
| `POST` | `/api/v1/auth/logout-all`                | Authenticated | Revoke all sessions for current user                     |
| `GET`  | `/api/v1/auth/me`                        | Authenticated | Return user, memberships, role, sites, and permissions   |
| `POST` | `/api/v1/auth/change-password`           | Authenticated | Verify current password, update hash, rotate sessions    |
| `POST` | `/api/v1/auth/invitations/:token/accept` | Public token  | Set password and activate invited user                   |
| `POST` | `/api/v1/auth/password-reset/request`    | Public        | Create reset request without revealing account existence |
| `POST` | `/api/v1/auth/password-reset/:token`     | Public token  | Set a new password and revoke prior sessions             |

All responses use the existing `{ data }` and structured `{ error }` envelopes. Authentication errors remain generic to prevent account discovery.

### Admin resources

Use `/api/v1/admin` for explicit administrative mutations:

- `/users` and `/invitations`: list, invite, edit name/role/site access, deactivate/reactivate, revoke sessions, resend/replace invitation.
- `/sites`: list, create, update, archive.
- `/assets`: list, create, update, archive/retire; nested component management.
- `/fault-definitions`: list, create, update, archive.
- `/procedures`: list, create draft, update, approve, withdraw, archive.
- `/audit-events`: paginated and filterable read-only log.

Mutation requirements:

- Validate DTOs with explicit allowlists and length/range constraints.
- Normalize email, asset tag, manufacturer/model matching fields, and fault codes on the server.
- Use transactions for invitations, role/site changes, knowledge approval, and their audit events.
- Return `409` for scoped uniqueness conflicts and unsafe lifecycle transitions.
- Use optimistic concurrency (`updatedAt` or version field) on admin edit forms to prevent silent overwrites.
- Paginate and filter all admin collection endpoints.

### Existing API changes

- Protect every `/api/v1` route except health, login, invitation acceptance, and password-reset completion.
- Require authentication before minting an AssemblyAI temporary token.
- Replace `DEMO_TECHNICIAN_ID` and `DEMO_SUPERVISOR_ID` with the authenticated actor.
- Replace `GET /api/v1/users` with an authenticated, site-scoped assignable-user endpoint such as `/api/v1/incidents/assignees?siteId=...`.
- Require supervisor/admin role for supervisor review routes.
- Require admin role for all admin routes.
- Validate that referenced assets, incidents, users, fault definitions, and procedures belong to the active organization and permitted site.
- Include actor identity in incident notes, readings, repairs, escalations, and supervisor acknowledgements.

## Backend structure

Add modules:

```text
apps/api/src/
├── auth/
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── auth.module.ts
│   ├── password.service.ts
│   ├── session.service.ts
│   ├── auth.guard.ts
│   ├── roles.guard.ts
│   ├── decorators.ts
│   └── dto.ts
├── access/
│   ├── access-context.ts
│   ├── access.service.ts
│   └── scoped-query.helpers.ts
├── admin/
│   ├── users/
│   ├── sites/
│   ├── assets/
│   ├── knowledge/
│   └── audit/
└── common/
    ├── request-id.middleware.ts
    ├── origin.guard.ts
    └── rate-limit.guard.ts
```

Use a global authentication guard with a `@Public()` decorator and a role/permission decorator for protected operations. Services receive the resolved access context and apply scoped Prisma filters internally.

## Frontend structure

Add a real router and authenticated application shell:

```text
/login
/
/supervisor
/admin
/admin/users
/admin/sites
/admin/assets
/admin/faults
/admin/procedures
/admin/audit
```

Frontend behavior:

- Load `/auth/me` before rendering protected routes.
- Send cookies with API calls and redirect `401` responses to login.
- Render navigation from returned permissions.
- Reject unauthorized routes with a clear `403` page; hiding a link is not authorization.
- Replace demo avatars and site labels with the signed-in user and active organization/site.
- Provide logout, password change, and organization/site selection.
- Keep pending form changes when a session expires, then retry only after the user signs in and reconfirms the write.

Admin workspace sections:

1. **Overview** — counts, inactive users, pending invites, archived resources, and recent audit events.
2. **Users** — search/filter, invite user, role/site assignment, deactivate/reactivate, revoke sessions.
3. **Sites** — create/edit/archive sites and show machine counts.
4. **Machines** — create/edit/archive assets, status/specification fields, and components.
5. **Fault codes** — create/edit/archive definitions and link compatible procedures.
6. **Procedures** — structured steps editor, safety confirmation setting, draft preview, approve/withdraw flow.
7. **Audit log** — filter by actor, action, resource, and date.

Forms must display server validation errors next to the affected field and require confirmation for deactivation, archival, procedure approval, and session revocation.

## Implementation phases

Current status: **Phase 1, 2, 3, 4, and 5 implemented**. Phase 6 is the next build target.

### Phase 1 — Security and tenancy foundation

- Add auth dependencies, environment variables, secure cookie configuration, request IDs, and rate-limit infrastructure.
- Add organization, membership, site access, session, invitation, reset-token, and audit models.
- Write and apply the additive/backfill migration.
- Update seeds with a development admin, supervisor, technician, memberships, and site access.
- Document secret generation and bootstrap administration.

**Exit condition:** existing data belongs to an organization, seeded memberships are valid, and no historical data is lost.

### Phase 2 — Login and session lifecycle

- Implement password hashing, login, logout, logout-all, `/auth/me`, password change, invitation acceptance, and session revocation.
- Add cookie, origin, expiry, disabled-user, and login throttling behavior.
- Add the login screen, auth provider, protected routes, current-user menu, and logout.

**Exit condition:** an active user can sign in and out; expired, revoked, invalid, or disabled sessions cannot access protected APIs.

### Phase 3 — RBAC and site scoping

- Add global authentication and role guards.
- Introduce access-context and scoped-query helpers.
- Protect all existing asset, knowledge, incident, repair, supervisor, and voice routes.
- Replace every seeded actor ID with the authenticated user ID.
- Enforce site-scoped reads, writes, assignment, and supervisor review.
- Change UI navigation and routes according to permissions.

**Exit condition:** cross-role, cross-organization, and unauthorized-site requests fail even when made directly against the API.

### Phase 4 — User administration

- Build user/invitation/session admin APIs and audit events.
- Build `/admin/users` list, filters, invite form, role/site editor, activation controls, and session revocation.
- Enforce last-admin and self-deactivation rules.

**Exit condition:** an admin can manage the complete user lifecycle while supervisors and technicians receive `403` responses.

### Phase 5 — Site and machine administration

- Build site, asset, and component admin APIs with scoped uniqueness and archive rules.
- Build site and machine list/detail/create/edit views.
- Add component editing and machine operating specifications.
- Make the technician and supervisor queries ignore archived resources while retaining their history.

**Exit condition:** an admin can add a site and machine that immediately appears to authorized users and voice asset lookup.

### Phase 6 — Fault-code and procedure administration

- Build fault-definition and procedure draft APIs.
- Add structured procedure-step validation, model/manufacturer compatibility checks, approval/withdrawal transactions, and audit events.
- Build fault and procedure administration views with draft preview.
- Ensure voice knowledge exposes only active, approved, compatible records.

**Exit condition:** an admin can publish a verified fault and approved procedure, and an authorized technician can retrieve it only for a matching machine.

### Phase 7 — Hardening, migration cleanup, and documentation

- Remove demo-actor paths and the obsolete `User.role` column.
- Add session cleanup and expired-token cleanup jobs.
- Review indexes and organization/site filters with realistic data volume.
- Complete security headers, cookie behavior, CORS/credentials, reverse-proxy, and secret documentation.
- Update Swagger with cookie auth and role requirements.
- Update README, maintenance, voice, supervisor, admin, deployment, backup, and recovery documentation.

**Exit condition:** the complete stack starts from Docker Compose, bootstraps securely, passes authorization tests, and contains no unguarded maintenance or administration route.

## Test plan

### Authentication tests

- Successful login, logout, logout-all, password change, invitation acceptance, and password reset.
- Generic failures for unknown email and wrong password.
- Expired, revoked, malformed, and replayed session/invitation/reset tokens.
- Deactivated user and changed-role session behavior.
- Cookie flags, origin checks, and login rate limits.

### Authorization tests

- Every protected endpoint returns `401` without a session.
- Each role receives the exact allowed/denied results from the permission matrix.
- Direct API calls cannot bypass hidden UI controls.
- Users cannot read or mutate another organization or an unassigned site by guessing UUIDs.
- Assignees must be eligible for the incident site.
- Voice token minting and voice write endpoints require an authenticated permitted user.

### Administration tests

- User invite, activation, role/site changes, deactivation, reactivation, and session revocation.
- Last-admin and self-deactivation protections.
- Scoped uniqueness for site codes, asset tags, fault definitions, and procedure keys.
- Archive behavior preserves incident and maintenance history.
- Draft/unapproved/withdrawn procedures never appear as approved voice guidance.
- Every successful and rejected sensitive action produces the intended audit behavior without leaking secrets.

### Browser workflows

- Login and role-directed landing page.
- Technician cannot open supervisor or admin routes.
- Supervisor can acknowledge and assign an escalation but cannot manage users/resources.
- Admin can invite a user, create a site/machine/component, create a fault definition, approve a procedure, and verify it appears in the technician workflow.
- Deactivating a logged-in user removes their access on the next request.

## Documentation deliverables

- `docs/authentication.md`: login, session, cookie, password, invitation, reset, and bootstrap behavior.
- `docs/authorization.md`: roles, permissions, organization/site scope, and guard patterns.
- `docs/admin.md`: user and resource administration workflows.
- `docs/admin-api.md`: endpoints, DTOs, lifecycle rules, conflicts, and examples.
- Update deployment environment examples without committing secrets.
- Update the existing supervisor and voice documentation to describe authenticated actors and permissions.

## Definition of done

- No maintenance, voice-token, supervisor, or admin endpoint trusts a client-supplied actor or seeded user ID.
- Every non-public request is authenticated and organization/site scoped.
- Admin, supervisor, and technician permissions match the matrix at both UI and API layers.
- An administrator can manage users, sites, machines, components, fault definitions, and procedures without direct database access.
- Resource archival preserves historical incidents and repairs.
- Knowledge approval remains explicit and auditable.
- Migrations preserve the current demo and working database.
- Unit, integration, authorization, and desktop/mobile browser tests pass.
- Security and administration documentation matches the implemented behavior.

## Recommended build order

Start with Phase 1 and Phase 2. Do not build the admin forms before Phase 3 is complete: otherwise the new mutation endpoints would exist without a reliable authorization and tenancy boundary. After RBAC is enforced, implement user administration first, followed by machine/site management and safety-sensitive fault/procedure publishing.
