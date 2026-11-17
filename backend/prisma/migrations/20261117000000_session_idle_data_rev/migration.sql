-- Sesi: waktu request terakhir, untuk logout otomatis setelah diam.
ALTER TABLE "sessions" ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Penanda versi data: satu baris yang angkanya naik setiap ada perubahan data.
CREATE TABLE "data_rev" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "rev" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "data_rev_pkey" PRIMARY KEY ("id")
);
INSERT INTO "data_rev" ("id", "rev") VALUES (1, 0);

CREATE OR REPLACE FUNCTION "bump_data_rev"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "data_rev" SET "rev" = "rev" + 1 WHERE "id" = 1;
  RETURN NULL;
END
$$;

CREATE TRIGGER "ledger_entries_bump_rev" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "ledger_entries"
  FOR EACH STATEMENT EXECUTE FUNCTION "bump_data_rev"();
CREATE TRIGGER "green_beans_bump_rev" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "green_beans"
  FOR EACH STATEMENT EXECUTE FUNCTION "bump_data_rev"();
CREATE TRIGGER "blends_bump_rev" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "blends"
  FOR EACH STATEMENT EXECUTE FUNCTION "bump_data_rev"();
CREATE TRIGGER "blend_recipe_items_bump_rev" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "blend_recipe_items"
  FOR EACH STATEMENT EXECUTE FUNCTION "bump_data_rev"();
CREATE TRIGGER "packs_bump_rev" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "packs"
  FOR EACH STATEMENT EXECUTE FUNCTION "bump_data_rev"();
CREATE TRIGGER "products_bump_rev" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "products"
  FOR EACH STATEMENT EXECUTE FUNCTION "bump_data_rev"();
CREATE TRIGGER "config_bump_rev" AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON "config"
  FOR EACH STATEMENT EXECUTE FUNCTION "bump_data_rev"();
