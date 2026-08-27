import { describe, expect, it } from "vitest";
import {
  buildAgentLaunchMessage,
  intentForLaunchMode,
  isAgentLaunchMode,
  launchPromptVariantForMode,
  type LaunchMessageIssue,
} from "@/lib/server/agent/launch-message";
import en from "../../../messages/en.json";
import fr from "../../../messages/fr.json";
import de from "../../../messages/de.json";

const issue: LaunchMessageIssue = {
  number: 42,
  title: "Rendre la palette navigable au clavier",
  plan: null,
  effort: "m",
};

const planned: LaunchMessageIssue = {
  ...issue,
  plan: "## Approche\n\n- [x] a\n- [ ] b",
};

describe("launchPromptVariantForMode", () => {
  it("cadrage : écrire le plan quand il manque, le vérifier quand il existe", () => {
    expect(launchPromptVariantForMode("plan", issue)).toBe("writePlan");
    expect(launchPromptVariantForMode("plan", planned)).toBe("reviewPlan");
  });

  it("implémentation : suit le plan puis l'effort, comme les boutons", () => {
    expect(launchPromptVariantForMode("implement", issue)).toBe("default");
    expect(launchPromptVariantForMode("implement", { ...issue, effort: "xs" })).toBe("xs");
    expect(launchPromptVariantForMode("implement", planned)).toBe("planExists");
  });

  it("vérification : une seule consigne, quel que soit l'état du ticket", () => {
    expect(launchPromptVariantForMode("verify", issue)).toBe("verifyImplementation");
    expect(launchPromptVariantForMode("verify", planned)).toBe("verifyImplementation");
  });

  it("dans une chaîne : les deux VÉRIFICATIONS passent en variante à verdict", () => {
    expect(launchPromptVariantForMode("verify", issue, true)).toBe(
      "chainVerifyImplementation",
    );
    // “Check plan” = `plan` mode on a ticket that already has one.
    expect(launchPromptVariantForMode("plan", planned, true)).toBe("chainVerifyPlan");
  });

  it("dans une chaîne : ÉCRIRE un plan et IMPLÉMENTER ne changent pas", () => {
    // Nothing to judge on a plan that we have just written, nor on the code that we have just
    // to ask: the verdict is the gesture of verification, not of work.
    expect(launchPromptVariantForMode("plan", issue, true)).toBe("writePlan");
    expect(launchPromptVariantForMode("implement", planned, true)).toBe("planExists");
  });
});

describe("intentForLaunchMode", () => {
  it("seul « implémenter » démarre le ticket : cadrer vient avant, vérifier après", () => {
    expect(intentForLaunchMode("plan")).toBe("plan");
    expect(intentForLaunchMode("implement")).toBe("implement");
    expect(intentForLaunchMode("verify")).toBe("verify");
  });
});

describe("isAgentLaunchMode", () => {
  it("ne laisse passer que les trois modes natifs", () => {
    expect(isAgentLaunchMode("verify")).toBe(true);
    expect(isAgentLaunchMode("review")).toBe(false);
    expect(isAgentLaunchMode(undefined)).toBe(false);
  });
});

describe("buildAgentLaunchMessage", () => {
  it("keeps the native button instruction without copying the untrusted issue title", async () => {
    const message = await buildAgentLaunchMessage({
      mode: "verify",
      issue: planned,
      projectKey: "MIN",
      locale: "en",
    });
    expect(message).toContain("Work on MIN-42.");
    expect(message).not.toContain(issue.title);
    expect(message).toContain(en.Agent.launchPrompt.verifyImplementation);
  });

  it("suit la langue du demandeur", async () => {
    const message = await buildAgentLaunchMessage({
      mode: "plan",
      issue: issue,
      projectKey: "MIN",
      locale: "fr",
    });
    expect(message).toContain("Travaille sur MIN-42");
    expect(message).toContain(fr.Agent.launchPrompt.writePlan);
  });

  it("uses the requester's supported locale", async () => {
    const message = await buildAgentLaunchMessage({
      mode: "implement",
      issue,
      projectKey: "MIN",
      locale: "de",
    });
    expect(message).toContain(de.Agent.launchPrompt.default);
  });

  it("les précisions de l'utilisateur s'ajoutent à la consigne, elles ne la remplacent pas", async () => {
    const message = await buildAgentLaunchMessage({
      mode: "verify",
      issue: planned,
      projectKey: "MIN",
      locale: "en",
      extra: "  Focus on the keyboard shortcuts.  ",
    });
    expect(message).toContain(en.Agent.launchPrompt.verifyImplementation);
    expect(message.endsWith("Focus on the keyboard shortcuts.")).toBe(true);
  });
});
