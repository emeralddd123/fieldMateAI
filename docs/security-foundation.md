# Security and tenancy foundation

Phase 1 establishes the database and HTTP foundation for authentication, RBAC, and administration. Login and route enforcement are implemented in Phases 2 and 3; the current application remains usable while those phases are built.

## Data ownership

The migration creates a `FieldMate Demo` organization and assigns all existing sites, machines, fault definitions, and procedures to it. Existing users receive an active organization membership and access to Plant Alpha. The migration is additive and preserves incidents, measurements, maintenance records, and escalation history.

New identity and security records include:

- organization memberships and site access;
- revocable server-side sessions;
- single-use user invitations and password-reset tokens;
- immutable administration audit events;
- user activation state and password metadata.

Session, invitation, and reset tokens will be stored only as hashes. Their raw values must never be logged or stored in audit event details.

## HTTP security defaults

The API now provides:

- Helmet security headers;
- request IDs accepted from a safe `X-Request-ID` value or generated as UUIDs;
- `X-Request-ID` on responses and structured errors;
- global request throttling;
- credential-aware CORS for the configured frontend origin;
- cookie parsing for the Phase 2 session implementation;
- trusted-proxy support for deployments behind a known reverse proxy.

The planned session cookie is `HttpOnly`, `SameSite=Lax`, scoped to `/`, and secure whenever `FRONTEND_URL` uses HTTPS. Production deployments must expose the application over HTTPS.

## Environment configuration

Copy `.env.example` to `.env` and set these values:

```dotenv
TRUST_PROXY=false
SESSION_COOKIE_NAME=fieldmate_session
SESSION_TTL_HOURS=168
API_RATE_LIMIT_TTL_MS=60000
API_RATE_LIMIT_MAX=300
AUTH_RATE_LIMIT_TTL_MS=60000
AUTH_RATE_LIMIT_MAX=10
BOOTSTRAP_ADMIN_EMAIL=admin@example.com
BOOTSTRAP_ADMIN_PASSWORD=
```

`TRUST_PROXY` must be `true` only when the API runs behind a trusted reverse proxy that overwrites forwarded headers. Authentication-specific throttling values are reserved for the Phase 2 login and invitation routes.

Generate a bootstrap password rather than reusing the database or provider credential:

```sh
openssl rand -base64 24
```

Store it in the local `.env` file, which is ignored by Git. The value must be 12–128 characters. Running the seed hashes it with Argon2id only when the bootstrap administrator does not already have a password, so later seed runs do not silently change administrator credentials.

The bootstrap identity exists after Phase 1, but interactive login becomes available in Phase 2.

## Seeded development identities

The development seed creates memberships for:

| User            | Email                                              | Role       |
| --------------- | -------------------------------------------------- | ---------- |
| Demo Technician | `technician@fieldmate.local`                       | Technician |
| Ibrahim Musa    | `supervisor@fieldmate.local`                       | Supervisor |
| Grace Okafor    | `grace@fieldmate.local`                            | Technician |
| FieldMate Admin | `BOOTSTRAP_ADMIN_EMAIL` or `admin@fieldmate.local` | Admin      |

All four identities receive Plant Alpha access. These identities support local development and automated tests; deployments should replace or deactivate them after the real administrator and users are provisioned.

## Migration and verification

Apply migrations without resetting the database:

```sh
docker compose up -d --build --wait
docker compose exec api pnpm prisma:migrate:deploy
docker compose exec api pnpm prisma:seed
docker compose exec api pnpm exec prisma migrate status
```

The API container already runs `prisma migrate deploy` before startup. The explicit commands are useful for deployment verification and controlled bootstrap operations.

Never use `seed:reset` on a working or production database.

## Phase boundary

Phase 1 does not yet authenticate requests or restrict routes. It deliberately retains the existing `User.role`, `Procedure.approved`, and seeded-actor paths for compatibility. Phase 2 adds login and session lifecycle. Phase 3 activates RBAC and site-scoped queries, replaces seeded actor IDs, and removes the compatibility paths after the migration is verified.
