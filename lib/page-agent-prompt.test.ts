import { describe, expect, it } from "vitest";
import { buildPageAgentPrompt, pageHref } from "@/lib/page-agent-prompt";

const input = {
  origin: "https://www.minddy.app",
  projectId: "11111111-1111-4111-8111-111111111111",
  pageId: "22222222-2222-4222-8222-222222222222",
  title: "Roadmap Q3",
};

describe("pageHref", () => {
  it("compose l'URL in-app d'une page", () => {
    expect(pageHref(input.origin, input.projectId, input.pageId)).toBe(
      `https://www.minddy.app/projects/${input.projectId}/pages/${input.pageId}`
    );
  });

  it("ne double pas la barre quand l'origine en porte une", () => {
    expect(pageHref("http://localhost:3000/", "p", "w")).toBe(
      "http://localhost:3000/projects/p/pages/w"
    );
  });
});

describe("buildPageAgentPrompt", () => {
  it("donne le lien cliquable ET les coordonnées de l'outil", () => {
    const text = buildPageAgentPrompt(input);
    expect(text).toContain('minddy page "Roadmap Q3"');
    expect(text).toContain(
      `https://www.minddy.app/projects/${input.projectId}/pages/${input.pageId}`
    );
    expect(text).toContain("minddy_get_page");
    // Les deux ids sont écrits EN CLAIR, en arguments : un agent ne doit pas
    // avoir à les découper de l'URL pour appeler l'outil.
    expect(text).toContain(`project_id "${input.projectId}"`);
    expect(text).toContain(`page_id "${input.pageId}"`);
  });

  it("nomme aussi les outils d'écriture", () => {
    const text = buildPageAgentPrompt(input);
    expect(text).toContain("minddy_update_page");
    expect(text).toContain("minddy_append_to_page");
    expect(text).toContain("minddy_edit_page_text");
    expect(text).toContain("minddy_add_page_comment");
  });

  it("ne demande RIEN quand la consigne est absente", () => {
    const text = buildPageAgentPrompt(input);
    expect(text).not.toContain("what I want you to do");
  });

  it("reprend la consigne verbatim, entre la page et les outils", () => {
    const text = buildPageAgentPrompt({
      ...input,
      instructions: "  Transforme les décisions de cette page en tickets.  ",
    });
    expect(text).toContain("what I want you to do with this page");
    // Verbatim, dans sa langue — mais sans les blancs de saisie autour.
    expect(text).toContain("Transforme les décisions de cette page en tickets.");
    expect(text).not.toContain("  Transforme");
    // L'ordre porte le sens : on nomme la page, on dit quoi en faire, puis on
    // donne de quoi la lire.
    expect(text.indexOf('minddy page "Roadmap Q3"')).toBeLessThan(
      text.indexOf("Transforme les décisions")
    );
    expect(text.indexOf("Transforme les décisions")).toBeLessThan(
      text.indexOf("minddy_get_page")
    );
  });

  it("traite une consigne de blancs comme une absence de consigne", () => {
    expect(buildPageAgentPrompt({ ...input, instructions: "   \n  " })).toBe(
      buildPageAgentPrompt(input)
    );
  });

  it("nomme une page sans titre plutôt que de laisser des guillemets vides", () => {
    expect(buildPageAgentPrompt({ ...input, title: "   " })).toContain(
      'minddy page "Untitled"'
    );
  });
});
