import { describe, expect, it } from "vitest";

import { decidePermission, type PermissionAsk } from "./opencode-permissions";
import { FORBIDDEN_COMMAND_REASON } from "../command-guard";
import { REPO_DIR } from "../repo-host";

/**
 * MIN-286 lot 2 — le verdict du harness sur une demande de permission d'opencode.
 *
 * Logique PURE, donc testée comme [prune.test.ts](../prune.test.ts) : on appelle,
 * on assert, rien à monter. Ce qu'elle protège n'a pas changé de nature — le
 * travail non commité (`command-guard`) et le dépôt (`repo-path`) —, seul
 * l'endroit où la question est posée a changé.
 */

const ask = (over: Partial<PermissionAsk>): PermissionAsk => ({
  id: "per_1",
  sessionId: "ses_1",
  permission: "bash",
  callId: "call_1",
  ...over,
});

describe("les commandes", () => {
  it("laisse passer ce qui ne détruit rien", () => {
    for (const command of ["echo hi", "npm test", "git status", "git add -A"]) {
      expect(decidePermission(ask({ command }))).toEqual({ reply: "once" });
    }
  });

  it("refuse ce que `command-guard` refuse, en disant pourquoi au modèle", () => {
    const verdict = decidePermission(ask({ command: "git reset --hard" }));
    expect(verdict.reply).toBe("reject");
    // Le message VOYAGE : opencode le recopie dans l'erreur du tool, et c'est là
    // que le modèle le lit. Un refus muet le laisserait deviner.
    expect(verdict.message).toContain("the harness owns git");
    // Et le refus reste mesurable en base, comme du temps de la boucle maison.
    expect(verdict.reason).toBe(FORBIDDEN_COMMAND_REASON);
  });

  it("refuse une demande dont il ne sait pas lire la commande", () => {
    expect(decidePermission(ask({ command: "  " })).reply).toBe("reject");
  });
});

describe("les écritures", () => {
  it("laisse passer un fichier du dépôt, relatif ou absolu", () => {
    expect(decidePermission(ask({ permission: "edit", filepath: "lib/a.ts" }))).toEqual({
      reply: "once",
    });
    expect(
      decidePermission(ask({ permission: "edit", filepath: `${REPO_DIR}/lib/a.ts` })),
    ).toEqual({ reply: "once" });
  });

  it("refuse ce qui sort du dépôt — y compris en chemin ABSOLU", () => {
    // Le piège du branchement : `resolveWithin` recolle un absolu sous le dépôt
    // (`/etc/passwd` → `<dépôt>/etc/passwd`), donc ne refuse rien. Or opencode
    // rend justement `metadata.filepath` en absolu.
    expect(decidePermission(ask({ permission: "edit", filepath: "/etc/passwd" })).reply).toBe(
      "reject",
    );
    expect(decidePermission(ask({ permission: "edit", filepath: "../../etc/passwd" })).reply).toBe(
      "reject",
    );
  });

  it("refuse `.git/`, qu'opencode écrit sans rien demander", () => {
    // Mesuré : `write` sur `<dépôt>/.git/config` a été exécuté et a écrasé le
    // fichier. C'est la raison d'être du `ask` sur `edit`.
    const verdict = decidePermission(ask({ permission: "edit", filepath: `${REPO_DIR}/.git/config` }));
    expect(verdict.reply).toBe("reject");
    expect(verdict.message).toContain(".git");
  });

  it("refuse une demande sans chemin", () => {
    expect(decidePermission(ask({ permission: "edit" })).reply).toBe("reject");
  });
});

describe("le reste", () => {
  it("refuse le disque hors dépôt", () => {
    expect(
      decidePermission(ask({ permission: "external_directory", filepath: "/etc/x" })).reply,
    ).toBe("reject");
  });

  it("laisse passer ce qui n'est pas gardé (la config l'a déjà tranché)", () => {
    expect(decidePermission(ask({ permission: "webfetch" }))).toEqual({ reply: "once" });
  });
});
