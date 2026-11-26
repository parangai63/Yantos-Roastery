-- Master supplier + hubungan banyak-ke-banyak supplier ↔ green bean / kemasan.
-- Data lama (teks green_beans.supplier & data->>'supplier' di transaksi beli) dipindahkan
-- menjadi baris supplier, lalu kolom green_beans.supplier dihapus.

CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_greens" (
    "supplierId" TEXT NOT NULL,
    "greenId" TEXT NOT NULL,

    CONSTRAINT "supplier_greens_pkey" PRIMARY KEY ("supplierId", "greenId")
);
CREATE INDEX "supplier_greens_greenId_idx" ON "supplier_greens"("greenId");
ALTER TABLE "supplier_greens" ADD CONSTRAINT "supplier_greens_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_greens" ADD CONSTRAINT "supplier_greens_greenId_fkey" FOREIGN KEY ("greenId") REFERENCES "green_beans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "supplier_packs" (
    "supplierId" TEXT NOT NULL,
    "packId" TEXT NOT NULL,

    CONSTRAINT "supplier_packs_pkey" PRIMARY KEY ("supplierId", "packId")
);
CREATE INDEX "supplier_packs_packId_idx" ON "supplier_packs"("packId");
ALTER TABLE "supplier_packs" ADD CONSTRAINT "supplier_packs_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_packs" ADD CONSTRAINT "supplier_packs_packId_fkey" FOREIGN KEY ("packId") REFERENCES "packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ikut menaikkan data_rev (master dimuat engine & di-cache di stateService).
CREATE TRIGGER "suppliers_bump_rev" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "suppliers"
  FOR EACH STATEMENT EXECUTE FUNCTION "bump_data_rev"();
CREATE TRIGGER "supplier_greens_bump_rev" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "supplier_greens"
  FOR EACH STATEMENT EXECUTE FUNCTION "bump_data_rev"();
CREATE TRIGGER "supplier_packs_bump_rev" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "supplier_packs"
  FOR EACH STATEMENT EXECUTE FUNCTION "bump_data_rev"();

-- ---------------------------------------------------------------------------
-- Pindahkan data lama. id supplier = 's_' + slug nama (sama dengan masterService.newId),
-- jadi "Mas Heri" dan "mas heri" menjadi satu supplier.
-- ---------------------------------------------------------------------------

CREATE FUNCTION "pg_temp"."supplier_id"(n TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT 's_' || COALESCE(
    NULLIF(left(trim(both '-' from regexp_replace(lower(trim(n)), '[^a-z0-9]+', '-', 'g')), 40), ''),
    substr(md5(n), 1, 8))
$$;

CREATE TEMP TABLE "old_supplier_refs" AS
  SELECT trim("supplier") AS name, 'green'::text AS kind, "id" AS item_id
    FROM "green_beans" WHERE trim("supplier") <> ''
  UNION ALL
  SELECT trim("data"->>'supplier'), 'green', "data"->>'greenId'
    FROM "ledger_entries" WHERE "type" = 'green_in' AND trim(coalesce("data"->>'supplier', '')) <> ''
  UNION ALL
  SELECT trim("data"->>'supplier'), 'pack', "data"->>'packId'
    FROM "ledger_entries" WHERE "type" = 'pack_in' AND trim(coalesce("data"->>'supplier', '')) <> '';

-- Satu baris per id; nama yang paling sering dipakai menang.
INSERT INTO "suppliers" ("id", "name")
SELECT DISTINCT ON (sid) sid, name
FROM (
  SELECT pg_temp.supplier_id(name) AS sid, name, count(*) AS n
  FROM "old_supplier_refs" GROUP BY name
) t
ORDER BY sid, n DESC, name;

INSERT INTO "supplier_greens" ("supplierId", "greenId")
SELECT DISTINCT pg_temp.supplier_id(r.name), r.item_id
FROM "old_supplier_refs" r JOIN "green_beans" g ON g."id" = r.item_id
WHERE r.kind = 'green';

INSERT INTO "supplier_packs" ("supplierId", "packId")
SELECT DISTINCT pg_temp.supplier_id(r.name), r.item_id
FROM "old_supplier_refs" r JOIN "packs" p ON p."id" = r.item_id
WHERE r.kind = 'pack';

-- Transaksi beli lama: tambahkan supplierId, nama lama (snapshot) tetap disimpan.
UPDATE "ledger_entries"
SET "data" = "data" || jsonb_build_object('supplierId', pg_temp.supplier_id("data"->>'supplier'))
WHERE "type" IN ('green_in', 'pack_in') AND trim(coalesce("data"->>'supplier', '')) <> '';

DROP TABLE "old_supplier_refs";

ALTER TABLE "green_beans" DROP COLUMN "supplier";
