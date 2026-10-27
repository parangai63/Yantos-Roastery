-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('roasted', 'blend');

-- CreateEnum
CREATE TYPE "LedgerType" AS ENUM ('opening', 'green_in', 'pack_in', 'roast', 'blend', 'usage', 'adjust', 'sale', 'kas');

-- CreateTable
CREATE TABLE "green_beans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minKg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "minRoastedKg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "supplier" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "green_beans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blends" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cogs" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minKg" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "blends_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blend_recipe_items" (
    "id" TEXT NOT NULL,
    "blendId" TEXT NOT NULL,
    "greenId" TEXT NOT NULL,
    "pct" DECIMAL(6,3) NOT NULL,

    CONSTRAINT "blend_recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "minQty" DECIMAL(10,0) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "ProductKind" NOT NULL,
    "greenId" TEXT,
    "blendId" TEXT,
    "grams" INTEGER NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'Lainnya',
    "packId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config" (
    "id" TEXT NOT NULL DEFAULT 'main',
    "bizName" TEXT NOT NULL DEFAULT 'Yantos Roastery',
    "basis" TEXT NOT NULL DEFAULT 'kas',
    "savingPct" DECIMAL(6,3) NOT NULL DEFAULT 10,
    "savingMin" DECIMAL(14,2) NOT NULL DEFAULT 1000000,
    "shares" JSONB NOT NULL DEFAULT '[]',
    "routine" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "type" "LedgerType" NOT NULL,
    "date" VARCHAR(10) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "by" TEXT NOT NULL DEFAULT '',
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_entries_date_idx" ON "ledger_entries"("date");

-- CreateIndex
CREATE INDEX "ledger_entries_type_date_idx" ON "ledger_entries"("type", "date");

-- AddForeignKey
ALTER TABLE "blend_recipe_items" ADD CONSTRAINT "blend_recipe_items_blendId_fkey" FOREIGN KEY ("blendId") REFERENCES "blends"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blend_recipe_items" ADD CONSTRAINT "blend_recipe_items_greenId_fkey" FOREIGN KEY ("greenId") REFERENCES "green_beans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_greenId_fkey" FOREIGN KEY ("greenId") REFERENCES "green_beans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_blendId_fkey" FOREIGN KEY ("blendId") REFERENCES "blends"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_packId_fkey" FOREIGN KEY ("packId") REFERENCES "packs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
