-- Phase 1 is additive: preserve the existing role and approval columns until
-- authenticated authorization replaces the demo paths in later phases.
CREATE TYPE "UserStatus" AS ENUM ('invited', 'active', 'disabled');
CREATE TYPE "MembershipStatus" AS ENUM ('active', 'suspended');
CREATE TYPE "ProcedureStatus" AS ENUM ('draft', 'approved', 'withdrawn');

CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),
    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

INSERT INTO "organizations" ("id", "name", "slug", "updated_at")
VALUES ('00000000-0000-4000-8000-000000000100', 'FieldMate Demo', 'fieldmate-demo', CURRENT_TIMESTAMP);

ALTER TABLE "sites"
ADD COLUMN "organization_id" UUID,
ADD COLUMN "updated_at" TIMESTAMP(3),
ADD COLUMN "archived_at" TIMESTAMP(3);
UPDATE "sites"
SET
    "organization_id" = '00000000-0000-4000-8000-000000000100',
    "updated_at" = CURRENT_TIMESTAMP;
ALTER TABLE "sites" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "sites" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE INDEX "sites_organization_id_idx" ON "sites"("organization_id");
ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "assets"
ADD COLUMN "organization_id" UUID,
ADD COLUMN "archived_at" TIMESTAMP(3),
ADD COLUMN "retired_at" TIMESTAMP(3);
UPDATE "assets" AS asset
SET "organization_id" = site."organization_id"
FROM "sites" AS site
WHERE asset."site_id" = site."id";
ALTER TABLE "assets" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "assets_organization_id_idx" ON "assets"("organization_id");
ALTER TABLE "assets" ADD CONSTRAINT "assets_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "components"
ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updated_at" TIMESTAMP(3),
ADD COLUMN "archived_at" TIMESTAMP(3);
UPDATE "components" SET "updated_at" = CURRENT_TIMESTAMP;
ALTER TABLE "components" ALTER COLUMN "updated_at" SET NOT NULL;

ALTER TABLE "users"
ADD COLUMN "password_hash" TEXT,
ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'active',
ADD COLUMN "password_changed_at" TIMESTAMP(3),
ADD COLUMN "last_login_at" TIMESTAMP(3),
ADD COLUMN "updated_at" TIMESTAMP(3);
UPDATE "users" SET "updated_at" = CURRENT_TIMESTAMP;
ALTER TABLE "users" ALTER COLUMN "updated_at" SET NOT NULL;

CREATE TABLE "organization_memberships" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'technician',
    "status" "MembershipStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organization_memberships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_memberships_organization_id_user_id_key"
ON "organization_memberships"("organization_id", "user_id");
CREATE INDEX "organization_memberships_user_id_idx"
ON "organization_memberships"("user_id");
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "organization_memberships" (
    "id", "organization_id", "user_id", "role", "updated_at"
)
SELECT
    md5('00000000-0000-4000-8000-000000000100' || "id"::text)::uuid,
    '00000000-0000-4000-8000-000000000100',
    "id",
    "role",
    CURRENT_TIMESTAMP
FROM "users";

CREATE TABLE "membership_site_access" (
    "membership_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "membership_site_access_pkey" PRIMARY KEY ("membership_id", "site_id")
);
CREATE INDEX "membership_site_access_site_id_idx"
ON "membership_site_access"("site_id");
ALTER TABLE "membership_site_access" ADD CONSTRAINT "membership_site_access_membership_id_fkey"
FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_site_access" ADD CONSTRAINT "membership_site_access_site_id_fkey"
FOREIGN KEY ("site_id") REFERENCES "sites"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "membership_site_access" ("membership_id", "site_id")
SELECT membership."id", site."id"
FROM "organization_memberships" AS membership
JOIN "sites" AS site ON site."organization_id" = membership."organization_id";

CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");
CREATE INDEX "auth_sessions_user_id_expires_at_idx" ON "auth_sessions"("user_id", "expires_at");
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_invites" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "site_ids" JSONB NOT NULL DEFAULT '[]',
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_invites_token_hash_key" ON "user_invites"("token_hash");
CREATE INDEX "user_invites_organization_id_email_idx" ON "user_invites"("organization_id", "email");
CREATE INDEX "user_invites_expires_at_idx" ON "user_invites"("expires_at");
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");
CREATE INDEX "password_reset_tokens_user_id_expires_at_idx"
ON "password_reset_tokens"("user_id", "expires_at");
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "procedures"
ADD COLUMN "organization_id" UUID,
ADD COLUMN "status" "ProcedureStatus" NOT NULL DEFAULT 'draft',
ADD COLUMN "approved_by" UUID,
ADD COLUMN "approved_at" TIMESTAMP(3),
ADD COLUMN "updated_at" TIMESTAMP(3),
ADD COLUMN "archived_at" TIMESTAMP(3);
UPDATE "procedures"
SET
    "organization_id" = '00000000-0000-4000-8000-000000000100',
    "status" = CASE WHEN "approved" THEN 'approved'::"ProcedureStatus" ELSE 'draft'::"ProcedureStatus" END,
    "approved_at" = CASE WHEN "approved" THEN "created_at" ELSE NULL END,
    "updated_at" = CURRENT_TIMESTAMP;
ALTER TABLE "procedures" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "procedures" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE INDEX "procedures_organization_id_idx" ON "procedures"("organization_id");
CREATE INDEX "procedures_approved_by_idx" ON "procedures"("approved_by");
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_approved_by_fkey"
FOREIGN KEY ("approved_by") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "fault_definitions"
ADD COLUMN "organization_id" UUID,
ADD COLUMN "normalized_fault_code" TEXT,
ADD COLUMN "updated_at" TIMESTAMP(3),
ADD COLUMN "archived_at" TIMESTAMP(3);
UPDATE "fault_definitions"
SET
    "organization_id" = '00000000-0000-4000-8000-000000000100',
    "normalized_fault_code" = regexp_replace(upper("fault_code"), '[^A-Z0-9]', '', 'g'),
    "updated_at" = CURRENT_TIMESTAMP;
ALTER TABLE "fault_definitions" ALTER COLUMN "organization_id" SET NOT NULL;
ALTER TABLE "fault_definitions" ALTER COLUMN "normalized_fault_code" SET NOT NULL;
ALTER TABLE "fault_definitions" ALTER COLUMN "updated_at" SET NOT NULL;
CREATE INDEX "fault_definitions_organization_id_idx" ON "fault_definitions"("organization_id");
ALTER TABLE "fault_definitions" ADD CONSTRAINT "fault_definitions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_membership_id" UUID,
    "action" TEXT NOT NULL,
    "resource_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "request_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_events_organization_id_created_at_idx"
ON "audit_events"("organization_id", "created_at");
CREATE INDEX "audit_events_actor_user_id_created_at_idx"
ON "audit_events"("actor_user_id", "created_at");
CREATE INDEX "audit_events_resource_type_resource_id_idx"
ON "audit_events"("resource_type", "resource_id");
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey"
FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_membership_id_fkey"
FOREIGN KEY ("actor_membership_id") REFERENCES "organization_memberships"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
