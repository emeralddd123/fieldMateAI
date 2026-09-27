-- Remove obsolete role column from users table (role is now scoped in organization_memberships)
ALTER TABLE "users" DROP COLUMN IF EXISTS "role";

-- Add indexes for session cleanup and audit queries
CREATE INDEX IF NOT EXISTS "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");
CREATE INDEX IF NOT EXISTS "audit_events_organization_id_action_created_at_idx" ON "audit_events"("organization_id", "action", "created_at");
