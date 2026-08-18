import { describe, expect, it } from "vitest";
import { isPersistableKey } from "./query-provider";
import {
  agentRunDiffQueryKey,
  agentRunDiffStatQueryKey,
  agentRunQueryKey,
  allAgentSessionsQueryKey,
  issueAgentRunsQueryKey,
} from "./use-agent-runs";
import { agentActivityQueryKey } from "@/components/agent/agent-activity-context";

// The persistence filter decides what goes to disk (MIN-89). A fake
// positive here, it is either the localStorage quota saturated by the palette index,
// or a completed agent run redisplayed as active on reload.
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

  // The keys below are from lib/use-agent-runs.ts. A list
  // written exclusion “judgmentally” (agent-runs for agent-sessions, by
  // example) filters nothing while appearing to filter — this is exactly
  // ce que ce test verrouille.
  it("exclut les flux d'agent — périmés en secondes", () => {
    expect(isPersistableKey(issueAgentRunsQueryKey("i1"))).toBe(false);
    expect(isPersistableKey(agentRunQueryKey("r1"))).toBe(false);
    expect(isPersistableKey(["agent-run-events", "r1"])).toBe(false);
    expect(isPersistableKey(agentRunDiffQueryKey("r1"))).toBe(false);
    // DISTINCT segment of ["agent-run-diff"]: the comparison is done segment
    // per segment, so the diff prefix didn't catch it (MIN-303).
    expect(isPersistableKey(agentRunDiffStatQueryKey("r1"))).toBe(false);
    expect(isPersistableKey(allAgentSessionsQueryKey)).toBe(false);
  });

  // The activity poll runs every 4 s when an agent is working: it
  // was serialized to disk every tick, because the filter was targeting a
  // ["agent-activity"] that no one asks (MIN-303). The key is IMPORTED from
  // its module, not copied: this is the only way that this test proves something
  // thing. Written by hand, it passed without filtering anything.
  it("exclut le sondage d'activité d'agent, sur sa vraie clé", () => {
    expect(isPersistableKey(agentActivityQueryKey("p1"))).toBe(false);
    expect(isPersistableKey(agentActivityQueryKey(null))).toBe(false);
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

  it("exclut le SHA du déploiement — sinon le bandeau revient au rechargement", () => {
    expect(isPersistableKey(["version"])).toBe(false);
  });

  // The BODY of a page is up to 1 MB; the quota is ~5 MB. And the LIST,
  // who does not carry bodies, must remain persistent — it is she who paints
  // the tree on reload. A prefix written “judgment” would confuse the two.
  it("exclut le corps d'une page, mais garde la liste des pages", () => {
    expect(isPersistableKey(["page", "pg1"])).toBe(false);
    expect(isPersistableKey(["pages", "p1"])).toBe(true);
  });

  it("ne confond pas un préfixe avec une clé voisine", () => {
    // ["me","board"] shares its first segment with ["me","search-index"]:
    // the filter should compare the entire prefix, not just key[0].
    expect(isPersistableKey(["me", "cycle"])).toBe(true);
    expect(isPersistableKey(["me", "scratchpad"])).toBe(true);
    // A name that starts the same without being the same segment remains persistent.
    expect(isPersistableKey(["agent-reads"])).toBe(true);
  });
});
