import { describe, expect, it } from "vitest";
import { isPersistableKey } from "./query-provider";

// Le filtre de persistance décide ce qui part sur le disque (MIN-89). Un faux
// positif ici, c'est soit le quota localStorage saturé par l'index du palette,
// soit un run d'agent terminé réaffiché comme actif au rechargement.
describe("isPersistableKey", () => {
  it("persiste les caches de contenu", () => {
    expect(isPersistableKey(["projects"])).toBe(true);
    expect(isPersistableKey(["issues", "p1"])).toBe(true);
    expect(isPersistableKey(["me", "board"])).toBe(true);
    expect(isPersistableKey(["me", "summary"])).toBe(true);
    expect(isPersistableKey(["comments", "i1"])).toBe(true);
  });

  it("exclut l'index du palette — il sature le quota à lui seul", () => {
    expect(isPersistableKey(["me", "search-index"])).toBe(false);
  });

  // Les clés ci-dessous sont celles de lib/use-agent-runs.ts. Une liste
  // d'exclusion écrite « au jugé » (agent-runs pour agent-sessions, par
  // exemple) ne filtre rien tout en ayant l'air de filtrer — c'est exactement
  // ce que ce test verrouille.
  it("exclut les flux d'agent — périmés en secondes", () => {
    expect(isPersistableKey(["agent-run", "r1"])).toBe(false);
    expect(isPersistableKey(["agent-runs", "issue", "i1"])).toBe(false);
    expect(isPersistableKey(["agent-run-events", "r1"])).toBe(false);
    expect(isPersistableKey(["agent-run-pr", "r1"])).toBe(false);
    expect(isPersistableKey(["agent-run-diff", "r1"])).toBe(false);
    expect(isPersistableKey(["agent-sessions", "all"])).toBe(false);
    expect(isPersistableKey(["agent-activity", "r1"])).toBe(false);
  });

  it("exclut les pull requests et leurs commentaires", () => {
    expect(isPersistableKey(["pull-requests", "all"])).toBe(false);
    expect(isPersistableKey(["pr-comments", "r1"])).toBe(false);
    expect(isPersistableKey(["pr-review-comments", "r1"])).toBe(false);
  });

  it("exclut la facturation — droits et quotas repartent du serveur", () => {
    expect(isPersistableKey(["billing", "status"])).toBe(false);
    expect(isPersistableKey(["billing", "usage"])).toBe(false);
  });

  it("ne confond pas un préfixe avec une clé voisine", () => {
    // ["me","board"] partage son premier segment avec ["me","search-index"] :
    // le filtre doit comparer le préfixe entier, pas seulement key[0].
    expect(isPersistableKey(["me", "cycle"])).toBe(true);
    expect(isPersistableKey(["me", "scratchpad"])).toBe(true);
    // Un nom qui commence pareil sans être le même segment reste persistable.
    expect(isPersistableKey(["agent-reads"])).toBe(true);
  });
});
