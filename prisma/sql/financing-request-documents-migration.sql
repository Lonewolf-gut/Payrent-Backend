-- Per-request financing documents (linked to FinancingRequest instead of tenant-only uploads)
CREATE TABLE IF NOT EXISTS "FinancingRequestDocument" (
  "id" TEXT NOT NULL,
  "financingRequestId" TEXT NOT NULL,
  "documentType" "TenantFinancingDocType" NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "status" "FinancingDocReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNotes" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinancingRequestDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinancingRequestDocument_financingRequestId_documentType_key"
  ON "FinancingRequestDocument"("financingRequestId", "documentType");

CREATE INDEX IF NOT EXISTS "FinancingRequestDocument_financingRequestId_idx"
  ON "FinancingRequestDocument"("financingRequestId");

CREATE INDEX IF NOT EXISTS "FinancingRequestDocument_status_idx"
  ON "FinancingRequestDocument"("status");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'FinancingRequestDocument_financingRequestId_fkey'
  ) THEN
    ALTER TABLE "FinancingRequestDocument"
      ADD CONSTRAINT "FinancingRequestDocument_financingRequestId_fkey"
      FOREIGN KEY ("financingRequestId") REFERENCES "FinancingRequest"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
