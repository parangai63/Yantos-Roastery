-- Riwayat aktivitas (tanpa trigger bump_data_rev: tidak dipakai engine).
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "changes" JSONB,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "activity_logs_at_idx" ON "activity_logs"("at");
CREATE INDEX "activity_logs_userId_at_idx" ON "activity_logs"("userId", "at");
CREATE INDEX "activity_logs_entity_at_idx" ON "activity_logs"("entity", "at");

-- Hapus akun = soft delete. Nama unik kini dicek di aplikasi (hanya antar akun yang belum dihapus).
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);
DROP INDEX IF EXISTS "users_name_key";

-- Akun pencatat ledger (nama di kolom "by" tetap sebagai catatan saat entri dibuat).
ALTER TABLE "ledger_entries" ADD COLUMN "byUserId" TEXT;
