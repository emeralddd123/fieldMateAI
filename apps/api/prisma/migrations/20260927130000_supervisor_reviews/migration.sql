ALTER TABLE "escalations"
ADD COLUMN "acknowledged_at" TIMESTAMP(3),
ADD COLUMN "acknowledged_by" UUID;

CREATE INDEX "escalations_acknowledged_by_idx" ON "escalations"("acknowledged_by");

ALTER TABLE "escalations"
ADD CONSTRAINT "escalations_acknowledged_by_fkey"
FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
