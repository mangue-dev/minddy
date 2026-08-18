import { describe, expect, it } from "vitest";
import { mentionsNumo } from "@/lib/server/assistant/comment-agent";
import { forgeAttachmentMarkdown } from "./forge-image-assets";

/**
 * `mentionsNumo` until now decided the fate of a TICKET comment, written
 * in minddy's composer. Since MIN-162 it also decides what goes on
 * a pull request — including for a message written on github.com, where the
 * markdown is much more varied. A false positive costs one round of model
 * charged to the project owner; a false negative, a call left unanswered.
 */
describe("mentionsNumo on a pull request body", () => {
  it("recognizes the mention regardless of case", () => {
    expect(mentionsNumo("@numo peux-tu relire ?")).toBe(true);
    expect(mentionsNumo("@Numo peux-tu relire ?")).toBe(true);
    expect(mentionsNumo("cc @NUMO")).toBe(true);
  });

  it("recognizes it at the end of a line and inside a quote", () => {
    expect(mentionsNumo("Ça me semble bon.\n\n@numo")).toBe(true);
    expect(mentionsNumo("> un avis ?\n@numo qu'en penses-tu")).toBe(true);
    expect(mentionsNumo("(@numo)")).toBe(true);
  });

  it("does not trigger on an email address", () => {
    expect(mentionsNumo("écrivez à contact@numo.dev")).toBe(false);
  });

  it("does not trigger on a word that STARTS with numo", () => {
    expect(mentionsNumo("@numotron a poussé un commit")).toBe(false);
  });

  it("ignore un texte qui parle de Numo sans l'appeler", () => {
    expect(mentionsNumo("Numo a ouvert cette PR hier")).toBe(false);
    expect(mentionsNumo("la review de numo est passée")).toBe(false);
  });

  it("recognizes it in a message that also contains forge mentions", () => {
    expect(mentionsNumo("@mangue-dev et @numo, un avis ?")).toBe(true);
  });
});

describe("forgeAttachmentMarkdown", () => {
  const url = "https://xyz.supabase.co/storage/v1/object/public/forge-attachments/a/b/x.png";

  it("inserts an image so it can be viewed in the thread", () => {
    expect(forgeAttachmentMarkdown({ url, name: "capture.png", isImage: true })).toBe(
      `![capture.png](${url})`,
    );
  });

  it("lie tout le reste — un `![]()` sur un PDF ne donnerait qu'une icône cassée", () => {
    expect(forgeAttachmentMarkdown({ url, name: "trace.log", isImage: false })).toBe(
      `[trace.log](${url})`,
    );
  });

  it("escapes brackets in a file name, which would break the link", () => {
    expect(
      forgeAttachmentMarkdown({ url, name: "capture [1].png", isImage: true }),
    ).toBe(`![capture 1.png](${url})`);
  });
});
