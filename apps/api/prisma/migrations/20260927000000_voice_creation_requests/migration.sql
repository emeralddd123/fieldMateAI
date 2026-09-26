ALTER TABLE "incidents" ADD COLUMN "request_id" UUID,
ADD COLUMN "request_hash" TEXT,
ADD COLUMN "source" "RecordSource" NOT NULL DEFAULT 'manual';
ALTER TABLE "measurements" ADD COLUMN "request_id" UUID,
ADD COLUMN "request_hash" TEXT,
ADD COLUMN "source" "RecordSource" NOT NULL DEFAULT 'manual';
CREATE UNIQUE INDEX "incidents_request_id_key" ON "incidents"("request_id");
CREATE UNIQUE INDEX "measurements_request_id_key" ON "measurements"("request_id");
