import { describe, expect, it } from "vitest";

import {
  buildScriptsCommand,
  formatPlanReview,
  parseScriptsProbe,
  planCommands,
  PLAN_REVIEW_MAX_CHARS,
} from "./plan-review";

/** Le plan fondateur, réduit : celui du run `ada40ec9` (MIN-226), dont l'étape de
 *  vérification promettait un script qui n'existe pas dans ce dépôt. */
const PLAN = `## Contexte

Modifier la page objectifs.

## Tâches

- [ ] \`components/secondary-sidebar.tsx\` — vérifier qu'il n'y a rien à changer.
- [ ] \`app/objectives/page.tsx\` — replier le panneau dans la page.

## Vérification

\`\`\`bash
npm run lint
npm run typecheck
\`\`\`
`;

/** Ce que la sonde rend sur ce dépôt-ci. */
const MINDDY = { names: ["dev", "build", "start", "typecheck", "test"], workspace: false };

describe("planCommands", () => {
  it("lit les commandes DANS les blocs de code — c'est là que vit la vérification", () => {
    expect(planCommands(PLAN)).toEqual(["lint", "typecheck"]);
  });

  it("accepte les trois gestionnaires, en forme explicite", () => {
    expect(planCommands("`pnpm run build`, `yarn run test:watch`, `bun run dev`")).toEqual([
      "build",
      "test:watch",
      "dev",
    ]);
  });

  it("compte `npm test`, qui vise bien un script du manifeste", () => {
    expect(planCommands("Puis lancer npm test.")).toEqual(["test"]);
  });

  it("ne devine pas sur les formes ambiguës", () => {
    // `pnpm add`/`npx` ne nomment aucun script : les prendre pour tels ferait dire
    // au harness qu'il manque un script qui n'a jamais existé.
    expect(planCommands("`pnpm add zod`, `npx vitest run lib/plan.test.ts`, `npm install`")).toEqual(
      [],
    );
  });

  it("dédoublonne et écarte un drapeau", () => {
    expect(planCommands("npm run test -- --watch, puis `npm run test`, et npm run -- --help")).toEqual(
      ["test"],
    );
  });
});

describe("parseScriptsProbe", () => {
  const probe = (json: string, ws = ""): string => `${json}\n\n@@workspace\n${ws}`;

  it("relit les scripts du manifeste racine", () => {
    const out = parseScriptsProbe(probe(`{"scripts":{"dev":"next dev","test":"vitest"}}`));
    expect(out).toEqual({ names: ["dev", "test"], workspace: false });
  });

  it("voit un monorepo par `workspaces` ou par le fichier pnpm", () => {
    expect(parseScriptsProbe(probe(`{"workspaces":["packages/*"],"scripts":{}}`))?.workspace).toBe(
      true,
    );
    expect(
      parseScriptsProbe(probe(`{"scripts":{"build":"turbo build"}}`, "pnpm-workspace.yaml\n"))
        ?.workspace,
    ).toBe(true);
  });

  it("rend un manifeste sans scripts, et rien du tout sans manifeste", () => {
    expect(parseScriptsProbe(probe(`{"name":"x"}`))).toEqual({ names: [], workspace: false });
    // `package.json` absent : la sortie n'a que le marqueur.
    expect(parseScriptsProbe("\n@@workspace\n")).toBeNull();
    expect(parseScriptsProbe(probe("{ not json"))).toBeNull();
  });

  it("fait un seul aller-retour shell pour les deux moitiés", () => {
    const cmd = buildScriptsCommand();
    expect(cmd).toContain("package.json");
    expect(cmd).toContain("'@@workspace'");
    expect(cmd).toContain("pnpm-workspace.yaml");
  });
});

describe("formatPlanReview", () => {
  it("rend le plan et pose les questions du relecteur", () => {
    const block = formatPlanReview({ plan: PLAN, scripts: MINDDY })!;
    expect(block).toContain("- [ ] `app/objectives/page.tsx`");
    // Les trois défauts mesurés sur le run fondateur, un par question.
    expect(block).toContain("actually opened this turn");
    expect(block).toContain('"verify X"');
    expect(block).toContain("commands that exist in this repo");
    expect(block).toContain("no task mentions");
  });

  it("tranche le script inexistant et dit ceux qui existent", () => {
    const block = formatPlanReview({ plan: PLAN, scripts: MINDDY })!;
    expect(block).toContain("no `lint` script");
    expect(block).not.toContain("no `typecheck` script");
    expect(block).toContain("`typecheck`");
  });

  it("confirme quand tout existe, plutôt que de laisser la question ouverte", () => {
    const block = formatPlanReview({
      plan: "## Vérification\n\n`npm run typecheck`",
      scripts: MINDDY,
    })!;
    expect(block).toContain("every command your plan names exists");
    expect(block).not.toContain("do not exist");
  });

  it("se tait sur l'absence dans un monorepo — il ne peut pas savoir", () => {
    const block = formatPlanReview({
      plan: PLAN,
      scripts: { names: ["build"], workspace: true },
    })!;
    expect(block).not.toContain("no `lint` script");
    expect(block).toContain("declares workspaces");
  });

  it("sert la relecture même sans manifeste lisible", () => {
    const block = formatPlanReview({ plan: PLAN, scripts: null })!;
    expect(block).toContain("- [ ] `app/objectives/page.tsx`");
    expect(block).toContain("commands that exist in this repo");
    expect(block).not.toContain("package.json`");
  });

  it("signale un plan qui ne promet aucune commande", () => {
    const block = formatPlanReview({ plan: "## Tâches\n\n- [ ] faire le truc", scripts: MINDDY })!;
    expect(block).toContain("names no command to run");
    expect(block).toContain("`typecheck`");
  });

  it("pousse vers les corrections en place, jamais vers la réécriture", () => {
    const block = formatPlanReview({ plan: PLAN, scripts: MINDDY })!;
    expect(block).toContain("edit_issue_text");
    expect(block).toContain("append_to_plan");
    expect(block).toContain("Do NOT call `write_issue_plan`");
  });

  it("élide par le milieu un plan trop long — le contexte et la vérification restent", () => {
    const long = `DÉBUT\n${"x".repeat(PLAN_REVIEW_MAX_CHARS)}\nFIN`;
    const block = formatPlanReview({ plan: long, scripts: null })!;
    expect(block).toContain("DÉBUT");
    expect(block).toContain("FIN");
    expect(block).toContain("chars elided");
  });

  it("encadre le plan sans que ses propres blocs le referment", () => {
    const block = formatPlanReview({ plan: PLAN, scripts: null })!;
    // Le plan porte un bloc ```bash : une clôture à trois backticks serait fermée
    // par lui, et tout ce qui suit (questions comprises) se lirait comme du code.
    expect(block).toContain("````markdown");
    expect(block.trimEnd().endsWith("````")).toBe(false);
    // Une clôture par bloc, pas une de plus : l'ouverture et la fermeture.
    expect(block.match(/````/g)).toHaveLength(2);
  });

  it("se tait quand il n'y a pas de plan", () => {
    expect(formatPlanReview({ plan: "   \n", scripts: MINDDY })).toBeNull();
  });
});
