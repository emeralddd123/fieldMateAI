ALTER TABLE "incident_notes"
ADD COLUMN "request_id" UUID,
ADD COLUMN "request_hash" TEXT;

CREATE UNIQUE INDEX "incident_notes_request_id_key"
ON "incident_notes"("request_id");
