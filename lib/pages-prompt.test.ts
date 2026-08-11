import { describe, expect, it } from "vitest";
import { buildPageTaskPrompt } from "@/lib/pages-prompt";
import { isScratchpadPrompt } from "@/lib/scratchpad-prompt";

const TASK = "# Post-mortem\n\n## Suites\n\n- [~] relancer le cron";

describe("buildPageTaskPrompt", () => {
  it("names the page, and the heading the task lives under", () => {
    const prompt = buildPageTaskPrompt(TASK, { page: "Post-mortem du 3 mars" });
    expect(prompt).toContain(
      "Work through the following task from the page “Post-mortem du 3 mars” of my project."
    );
    // La chaîne de titres sort du bloc <notes> et se dit en clair : le bloc ne
    // porte QUE le travail à faire.
    expect(prompt).toContain(
      'This task is under the heading "Post-mortem > Suites" of that page.'
    );
    expect(prompt).toContain("<notes>\n- [~] relancer le cron\n</notes>");
    expect(prompt).not.toContain("# Post-mortem");
  });

  it("points at the PAGE tools, never the notebook's", () => {
    const prompt = buildPageTaskPrompt(TASK, { page: "Post-mortem" });
    expect(prompt).toContain("minddy_get_page");
    expect(prompt).toContain("minddy_edit_page_text");
    expect(prompt).not.toContain("minddy_get_scratchpad");
  });

  it("drops the MCP block for the Numo run, and nothing else", () => {
    const withMcp = buildPageTaskPrompt(TASK, { page: "P" });
    const without = buildPageTaskPrompt(TASK, { page: "P", mcp: false });
    expect(without).not.toContain("minddy_get_page");
    expect(withMcp.startsWith(without)).toBe(true);
  });

  it("still says where it comes from when the page has no title yet", () => {
    const prompt = buildPageTaskPrompt("- [ ] écrire le compte-rendu", {
      page: "  ",
    });
    expect(prompt).toContain(
      "Work through the following task from a page of my project."
    );
  });

  it("does not call a block of prose a task", () => {
    const prompt = buildPageTaskPrompt("Deux paragraphes de contexte.", {
      page: "P",
    });
    expect(prompt).toContain("the following excerpt");
    expect(prompt).not.toContain("the following task");
  });

  /**
   * Ce qui compte pour le serveur : le prompt d'une page porte la MÊME
   * signature que celui du carnet, donc `execute.ts` le laisse passer au lieu
   * de l'emballer une seconde fois (cf. lib/server/agent/execute.ts). Et le
   * réemballer ici ne fait rien non plus — le composer de la page Agents rend
   * le texte éditable, il peut donc repasser par la fabrique.
   */
  it("is recognised as an already-wrapped prompt, and survives a second pass", () => {
    const prompt = buildPageTaskPrompt(TASK, { page: "P" });
    expect(isScratchpadPrompt(prompt)).toBe(true);
    expect(buildPageTaskPrompt(prompt, { page: "P" })).toBe(prompt.trim());
  });
});
