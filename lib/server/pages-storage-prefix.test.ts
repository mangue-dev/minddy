import { describe, expect, it } from "vitest";
import { pageFileStoragePrefix } from "@/lib/page-files";
import { canonicalSql, readBaseline } from "@/test/sql-migrations";

/**
 * L'INVARIANT des fichiers de page, tenu sur la seule chose qui l'applique
 * vraiment : la policy d'insertion du storage (MIN-350).
 *
 * Un fichier de page naît côté serveur, dans le même appel que sa ligne
 * `page_files` (app/api/projects/[id]/pages/[pageId]/files/route.ts) — un objet
 * sans sa ligne serait invisible au balayage des orphelins, donc éternel. Mais
 * l'envoi d'une pièce jointe de TICKET, lui, part du navigateur directement vers
 * le bucket : la policy est tout ce qu'il croise, et elle ouvrait
 * `projects/{id}/…` en entier — le préfixe des pages compris.
 *
 * Ce test relit la dernière migration qui (re)définit la policy et exige qu'elle
 * en exclue le segment `pages`. Il est structurel, comme
 * `pages-search-paths.test.ts` : il ne parle pas à Postgres, il empêche une
 * réécriture de la policy de laisser la branche tomber en la recopiant — c'est
 * exactement comme ça que le trou est né, la policy du quota (MIN-348) ayant
 * repris celle de MIN-124 « à l'identique ».
 */

function currentPolicySql(): string {
  const sql = canonicalSql(readBaseline());
  const start = sql.indexOf("create policy attachments insert");
  if (start < 0) throw new Error("la baseline ne crée pas la policy `attachments insert`");
  return sql.slice(start, sql.indexOf(";", start));
}

describe("le préfixe des fichiers de page", () => {
  it("est bien DANS le préfixe des ressources de projet", () => {
    // Si ça change, c'est la garde ci-dessous qu'il faut refaire, pas ce test.
    expect(pageFileStoragePrefix("PROJET", "PAGE")).toBe("projects/PROJET/pages/PAGE");
  });

  it("n'est pas écrivable par le client", () => {
    const sql = currentPolicySql();
    expect(sql).toContain("(storage.foldername(name))[3]");
    expect(sql).toMatch(/<>\s*'pages'/);
  });
});
