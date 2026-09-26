-- Human-readable incident IDs are allocated atomically, including concurrent requests.
CREATE SEQUENCE "incident_number_seq" START WITH 1048;

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('technician', 'supervisor', 'admin');

-- CreateEnum
CREATE TYPE "IncidentPriority" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('open', 'investigating', 'escalated', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('voice', 'manual', 'imported');

-- CreateEnum
CREATE TYPE "NoteSource" AS ENUM ('voice', 'manual', 'system');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'technician',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "procedures" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "asset_type" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "safety_level" TEXT NOT NULL,
    "safety_confirmation_required" BOOLEAN NOT NULL DEFAULT true,
    "summary" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "procedures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fault_definitions" (
    "id" UUID NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "fault_code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "safety_level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "procedure_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fault_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incidents" (
    "id" UUID NOT NULL,
    "incident_number" TEXT NOT NULL DEFAULT ('INC-'::text || (nextval('incident_number_seq'::regclass))::text),
    "asset_id" UUID NOT NULL,
    "opened_by" UUID NOT NULL,
    "assigned_to" UUID,
    "fault_code" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "IncidentPriority" NOT NULL DEFAULT 'medium',
    "status" "IncidentStatus" NOT NULL DEFAULT 'open',
    "root_cause" TEXT,
    "action_taken" TEXT,
    "resolution_summary" TEXT,
    "completion_payload" JSONB,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_notes" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "author_id" UUID,
    "note" TEXT NOT NULL,
    "source" "NoteSource" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "measurements" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "incident_id" UUID,
    "measurement_type" TEXT NOT NULL,
    "value" DECIMAL(16,6) NOT NULL,
    "unit" TEXT NOT NULL,
    "notes" TEXT,
    "recorded_by" UUID,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_records" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "incident_id" UUID,
    "technician_id" UUID,
    "fault_code" TEXT,
    "symptom" TEXT NOT NULL,
    "root_cause" TEXT NOT NULL,
    "action_taken" TEXT NOT NULL,
    "verification" TEXT NOT NULL,
    "source" "RecordSource" NOT NULL DEFAULT 'manual',
    "performed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escalations" (
    "id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "escalations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "procedures_key_key" ON "procedures"("key");

-- CreateIndex
CREATE UNIQUE INDEX "fault_definitions_manufacturer_model_fault_code_key" ON "fault_definitions"("manufacturer", "model", "fault_code");

-- CreateIndex
CREATE UNIQUE INDEX "incidents_incident_number_key" ON "incidents"("incident_number");

-- CreateIndex
CREATE INDEX "incidents_asset_id_fault_code_opened_at_idx" ON "incidents"("asset_id", "fault_code", "opened_at");

-- CreateIndex
CREATE INDEX "incidents_status_idx" ON "incidents"("status");

-- CreateIndex
CREATE INDEX "incident_notes_incident_id_created_at_idx" ON "incident_notes"("incident_id", "created_at");

-- CreateIndex
CREATE INDEX "measurements_asset_id_recorded_at_idx" ON "measurements"("asset_id", "recorded_at");

-- CreateIndex
CREATE INDEX "measurements_incident_id_idx" ON "measurements"("incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_records_incident_id_key" ON "maintenance_records"("incident_id");

-- CreateIndex
CREATE INDEX "maintenance_records_asset_id_performed_at_idx" ON "maintenance_records"("asset_id", "performed_at");

-- CreateIndex
CREATE INDEX "escalations_incident_id_idx" ON "escalations"("incident_id");

-- AddForeignKey
ALTER TABLE "fault_definitions" ADD CONSTRAINT "fault_definitions_procedure_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_opened_by_fkey" FOREIGN KEY ("opened_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_notes" ADD CONSTRAINT "incident_notes_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_records" ADD CONSTRAINT "maintenance_records_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
