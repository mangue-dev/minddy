import { describe, expect, it } from "vitest";
import { pageFileStoragePrefix } from "@/lib/page-files";
import { canonicalSql, readBaseline } from "@/test/sql-migrations";

/**
 * The INVARIANT of page files, held on the only thing that applies it
 * really: the storage insertion policy (MIN-350).
 *
 * A page file is born on the server side, in the same call as its line
 * `page_files` (app/api/projects/[id]/pages/[pageId]/files/route.ts) — an object
 * without its line would be invisible to orphan scanning, therefore eternal. But
 * sending a TICKET attachment goes from the browser directly to
 * the bucket: the policy is everything it crosses, and it opened
 * `projects/{id}/…` in full — including the prefix of the pages.
 *
 * This test rereads the last migration which (re)defines the policy and requires that it
 * excludes the `pages` segment. It is structural, like
 * `pages-search-paths.test.ts`: it does not talk to Postgres, it prevents a
 * rewrite of the policy from letting the branch fall by copying it — this is
 * exactly how the hole was born, the quota policy (MIN-348) having
 * taken over that of MIN-124 “identically”.
 */

function currentPolicySql(): string {
  const sql = canonicalSql(readBaseline());
  const start = sql.indexOf("create policy attachments insert");
  if (start < 0) throw new Error("la baseline ne crée pas la policy `attachments insert`");
  return sql.slice(start, sql.indexOf(";", start));
}

describe("le préfixe des fichiers de page", () => {
  it("est bien DANS le préfixe des ressources de projet", () => {
    // If that changes, it's the guard below that needs to be redone, not this test.
    expect(pageFileStoragePrefix("PROJET", "PAGE")).toBe("projects/PROJET/pages/PAGE");
  });

  it("n'est pas écrivable par le client", () => {
    const sql = currentPolicySql();
    expect(sql).toContain("(storage.foldername(name))[3]");
    expect(sql).toMatch(/<>\s*'pages'/);
  });
});
