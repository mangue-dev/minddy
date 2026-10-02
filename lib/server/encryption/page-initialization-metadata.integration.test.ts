import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const container = "supabase_db_minddy-encryption-test";
const enabled = process.env.MINDDY_ENCRYPTION_DB_TEST === "true";
const initialization = readFileSync("supabase/migrations/20270107730000_page_content_encryption.sql", "utf8")
  .split("CREATE INDEX pages_content_migration_queue")[0] + "\nCOMMIT;";
function sql(database: string, input: string) {
  return execFileSync("docker", ["exec", "-i", container, "psql", "-X", "-U", "supabase_admin",
    "-d", database, "-At", "-v", "ON_ERROR_STOP=1"],
  { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
}
function fixture(run: (database: string) => void) {
  const database = `min591_page_initialization_${randomBytes(6).toString("hex")}`;
  execFileSync("docker", ["exec", container, "createdb", "-U", "supabase_admin", "-T", "template0", database]);
  try {
    sql(database, `CREATE TABLE public.pages(id uuid PRIMARY KEY,title text NOT NULL,icon text,
      content jsonb NOT NULL,database_schema jsonb,database_title_name text,
      property_values jsonb NOT NULL DEFAULT '{}',search_text text NOT NULL DEFAULT '',
      updated_at timestamptz NOT NULL,version integer NOT NULL DEFAULT 3);
      CREATE FUNCTION public.touch_page() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN NEW.updated_at:=now(); RETURN NEW; END; $$;
      CREATE TRIGGER pages_set_updated_at BEFORE UPDATE ON public.pages
        FOR EACH ROW EXECUTE FUNCTION public.touch_page();
      INSERT INTO public.pages(id,title,content,updated_at) VALUES
        ('00000000-0000-4000-8000-000000000001','','{"type":"doc","content":[]}','2020-01-01');`);
    run(database);
  } finally {
    execFileSync("docker", ["exec", container, "dropdb", "-U", "supabase_admin", "--force", database]);
  }
}

describe.skipIf(!enabled)("page content metadata initialization", () => {
  it("preserves historical timestamps and restores the ordinary edit trigger", () => fixture(database => {
    const before = sql(database, "SELECT updated_at,version FROM public.pages;");
    sql(database, initialization);
    expect(sql(database, "SELECT updated_at,version FROM public.pages;")).toBe(before);
    expect(sql(database, "SELECT page_is_database,page_has_values,page_is_blank FROM public.pages;")).toBe("f|f|t");
    expect(sql(database, "SELECT tgenabled FROM pg_trigger WHERE tgname='pages_set_updated_at';")).toBe("O");
    sql(database, "UPDATE public.pages SET title='Edited page',version=4;");
    expect(sql(database, "SELECT updated_at>'2020-01-01'::timestamptz,version FROM public.pages;")).toBe("t|4");
  }), 20000);

  it("rolls back trigger suspension when initialization fails", () => fixture(database => {
    sql(database, "UPDATE public.pages SET content='{\"content\":[{\"type\":\"paragraph\",\"content\":{}}]}';");
    // Force a failure after the exact initialization prefix, while still inside BEGIN.
    expect(() => sql(database, initialization.replace("COMMIT;", "SELECT 1/0; COMMIT;"))).toThrow();
    expect(sql(database, "SELECT tgenabled FROM pg_trigger WHERE tgname='pages_set_updated_at';")).toBe("O");
    expect(sql(database, `SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
      AND table_name='pages' AND column_name='encrypted_content';`)).toBe("0");
  }), 20000);
});
