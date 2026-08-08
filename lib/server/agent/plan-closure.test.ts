import { describe, expect, it } from "vitest";

import {
  buildClosureCommand,
  formatPlanClosure,
  MAX_FILES_PER_NEEDLE,
  MAX_NEEDLES,
  newPlanWriteSink,
  parseClosureOutput,
  planNamesFile,
  planNeedles,
  watchPlanWrites,
} from "./plan-closure";

/** Le plan fondateur : celui de MIN-226, qui nommait deux des quatre fichiers. */
const PLAN = `## Contexte

Supprimer \`ObjectiveSidePanel\` et replier son contenu dans la page.

## Tâches

- [ ] \`components/objectives/objective-side-panel.tsx\` — supprimer le composant.
- [ ] app/objectives/page.tsx — retirer l'import et le rendu.
`;

describe("planNeedles", () => {
  it("garde les identifiants de code et jette les mots", () => {
    const needles = planNeedles(
      "Le `plan` du ticket appelle `formatSelfReview` depuis `ObjectiveSidePanel`, avec `grep`.",
    ).map((n) => n.needle);
    expect(needles).toEqual(["formatSelfReview", "ObjectiveSidePanel"]);
  });

  it("garde les constantes en majuscules", () => {
    expect(planNeedles("plafonné par `MAX_TURN_END_REENTRIES`").map((n) => n.needle)).toEqual([
      "MAX_TURN_END_REENTRIES",
    ]);
  });

  it("réduit un chemin à son basename sans extension — ce que citent les imports", () => {
    expect(planNeedles(PLAN)).toContainEqual({
      needle: "objective-side-panel",
      source: "components/objectives/objective-side-panel.tsx",
    });
  });

  it("attrape aussi un chemin écrit sans backticks", () => {
    const sources = planNeedles("Modifier app/objectives/list-view.tsx en premier.").map(
      (n) => n.source,
    );
    expect(sources).toEqual(["app/objectives/list-view.tsx"]);
  });

  it("ignore un chemin dont le basename est un mot, pas un nom", () => {
    // `page`/`route` : conventions Next.js. `execute`/`turn` : deux mots anglais qui
    // ramenaient plus de cent fichiers chacun sur ce dépôt, et mangeaient deux places.
    expect(
      planNeedles("`app/objectives/page.tsx`, `lib/route.ts`, `lib/server/agent/execute.ts`, `lib/server/agent/vm/turn.ts`"),
    ).toEqual([]);
  });

  it("réduit un fichier de test au module qu'il teste", () => {
    expect(planNeedles("`lib/server/agent/plan-closure.test.ts`").map((n) => n.needle)).toEqual([
      "plan-closure",
    ]);
  });

  it("ne grep pas le contenu d'un bloc de code — c'est un exemple, pas une cible", () => {
    const plan = [
      "Ajouter le garde :",
      "```ts",
      "if (!issueTool) return subagentDenied(name);",
      "```",
      "dans `execTool`.",
    ].join("\n");
    expect(planNeedles(plan).map((n) => n.needle)).toEqual(["execTool"]);
  });

  it("dédoublonne et plafonne", () => {
    const plan = Array.from({ length: MAX_NEEDLES + 5 }, (_, i) => `\`someSymbol${i}\``).join(" ");
    expect(planNeedles(`${plan} \`someSymbol0\``)).toHaveLength(MAX_NEEDLES);
  });

  it("écarte ce qui casserait le quoting ou n'est pas un symbole", () => {
    expect(planNeedles("`npm run typecheck`, `t(\"key\")`, `l'état`, `x`")).toEqual([]);
  });
});

describe("buildClosureCommand / parseClosureOutput", () => {
  it("fait un seul aller-retour shell, un groupe par motif", () => {
    const cmd = buildClosureCommand(["ObjectiveSidePanel", "objective-side-panel"]);
    expect(cmd.match(/git grep/g)).toHaveLength(2);
    expect(cmd).toContain("'@@needle ObjectiveSidePanel'");
    expect(cmd).toContain("-e 'objective-side-panel'");
    // `git grep` sort en 1 quand il ne trouve rien : c'est un résultat, pas une panne.
    expect(cmd).toContain("|| true");
    // Une ligne de plus que le cap : assez pour savoir qu'on est au-dessus.
    expect(cmd).toContain(`head -n ${MAX_FILES_PER_NEEDLE + 1}`);
  });

  it("relit les groupes, y compris ceux restés vides", () => {
    const out = [
      "@@needle ObjectiveSidePanel",
      "app/objectives/page.tsx",
      "components/objectives/objective-list.tsx",
      "@@needle absent",
      "",
    ].join("\n");
    const parsed = parseClosureOutput(out);
    expect(parsed.get("ObjectiveSidePanel")).toEqual([
      "app/objectives/page.tsx",
      "components/objectives/objective-list.tsx",
    ]);
    expect(parsed.get("absent")).toEqual([]);
  });
});

describe("planNamesFile", () => {
  it("reconnaît le chemin complet, un suffixe de deux segments, un basename distinctif", () => {
    expect(planNamesFile(PLAN, "app/objectives/page.tsx")).toBe(true);
    expect(planNamesFile("voir objectives/objective-side-panel.tsx", "components/objectives/objective-side-panel.tsx")).toBe(true);
    expect(planNamesFile("voir `objective-list.tsx`", "components/objectives/objective-list.tsx")).toBe(true);
  });

  it("ne prend pas un basename générique pour une mention", () => {
    expect(planNamesFile("modifier `page.tsx`", "app/settings/page.tsx")).toBe(false);
  });

  it("dit non quand le plan ne parle pas du fichier", () => {
    expect(planNamesFile(PLAN, "components/objectives/objective-list.tsx")).toBe(false);
  });
});

describe("formatPlanClosure", () => {
  const hits = [
    {
      needle: "ObjectiveSidePanel",
      source: "ObjectiveSidePanel",
      files: [
        "app/objectives/page.tsx",
        "components/objectives/objective-side-panel.tsx",
        "components/objectives/objective-list.tsx",
        "components/objectives/objective-header.tsx",
      ],
    },
  ];

  it("ne rapporte que les fichiers que le plan ne nomme pas", () => {
    const block = formatPlanClosure({ plan: PLAN, hits });
    expect(block).toContain("objective-list.tsx");
    expect(block).toContain("objective-header.tsx");
    // Les deux que le plan nomme déjà ne reviennent pas.
    expect(block).not.toContain("- app/objectives/page.tsx");
    expect(block).not.toContain("- components/objectives/objective-side-panel.tsx");
    expect(block).toContain("2 files");
  });

  it("dit que c'est une observation et pousse vers append_to_plan", () => {
    const block = formatPlanClosure({ plan: PLAN, hits })!;
    expect(block).toContain("not a verdict");
    expect(block).toContain("append_to_plan");
    expect(block).not.toContain("write_issue_plan");
  });

  it("se tait quand le plan nomme tout", () => {
    expect(
      formatPlanClosure({
        plan: PLAN,
        hits: [{ needle: "ObjectiveSidePanel", source: "ObjectiveSidePanel", files: ["app/objectives/page.tsx"] }],
      }),
    ).toBeNull();
  });

  it("se tait quand rien n'a été trouvé", () => {
    expect(
      formatPlanClosure({
        plan: PLAN,
        hits: [{ needle: "ObjectiveSidePanel", source: "ObjectiveSidePanel", files: [] }],
      }),
    ).toBeNull();
  });

  it("jette un symbole trop répandu plutôt que de noyer le signal", () => {
    const files = Array.from({ length: MAX_FILES_PER_NEEDLE + 1 }, (_, i) => `lib/mod-${i}.ts`);
    expect(
      formatPlanClosure({ plan: PLAN, hits: [{ needle: "useTranslations", source: "useTranslations", files }] }),
    ).toBeNull();
  });

  it("dit le motif grepé quand il diffère du token du plan", () => {
    const block = formatPlanClosure({
      plan: "rien",
      hits: [
        {
          needle: "objective-side-panel",
          source: "components/objectives/objective-side-panel.tsx",
          files: ["app/objectives/page.tsx"],
        },
      ],
    })!;
    expect(block).toContain("`components/objectives/objective-side-panel.tsx`");
    expect(block).toContain("grepped as `objective-side-panel`");
  });
});

describe("watchPlanWrites", () => {
  const ok = async () => ({ result: { ok: true }, success: true });

  it("note le plan d'un write_issue_plan réussi", async () => {
    const sink = newPlanWriteSink();
    await watchPlanWrites(ok, sink)("write_issue_plan", { plan: PLAN });
    expect(sink.wrote).toBe(true);
    expect(sink.markdown).toBe(PLAN);
  });

  it("ne note rien quand le tool a échoué", async () => {
    const sink = newPlanWriteSink();
    const failing = async () => ({ result: { error: "no such issue" }, success: false });
    await watchPlanWrites(failing, sink)("write_issue_plan", { plan: PLAN });
    expect(sink.wrote).toBe(false);
    expect(sink.markdown).toBe("");
  });

  it("compte un append du même tour comme couverture, sans déclencher le contrôle", async () => {
    const sink = newPlanWriteSink();
    const watched = watchPlanWrites(ok, sink);
    await watched("append_to_plan", { markdown: "- [ ] `objective-list.tsx` aussi." });
    expect(sink.wrote).toBe(false);
    await watched("write_issue_plan", { plan: PLAN });
    await watched("append_to_plan", { markdown: "- [ ] `objective-list.tsx` aussi." });
    expect(sink.wrote).toBe(true);
    expect(planNamesFile(sink.markdown, "components/objectives/objective-list.tsx")).toBe(true);
  });

  it("laisse passer les autres tools ticket sans y toucher", async () => {
    const sink = newPlanWriteSink();
    const out = await watchPlanWrites(ok, sink)("read_issue", { issue: "MIN-236" });
    expect(out.success).toBe(true);
    expect(sink.wrote).toBe(false);
  });
});
