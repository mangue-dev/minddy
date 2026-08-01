import { describe, expect, it } from "vitest";
import { mentionsNumo } from "@/lib/server/assistant/comment-agent";
import { forgeAttachmentMarkdown } from "./forge-image-assets";

/**
 * `mentionsNumo` décidait jusqu'ici du sort d'un commentaire de TICKET, écrit
 * dans le composer de minddy. Depuis MIN-162 il décide aussi de ce qui part sur
 * une pull request — y compris pour un message écrit sur github.com, où le
 * markdown est autrement plus varié. Un faux positif y coûte un tour de modèle
 * facturé au owner du projet ; un faux négatif, un appel resté sans réponse.
 */
describe("mentionsNumo, sur un corps de pull request", () => {
  it("reconnaît l'appel, à casse libre", () => {
    expect(mentionsNumo("@numo peux-tu relire ?")).toBe(true);
    expect(mentionsNumo("@Numo peux-tu relire ?")).toBe(true);
    expect(mentionsNumo("cc @NUMO")).toBe(true);
  });

  it("le reconnaît en fin de ligne et dans une citation", () => {
    expect(mentionsNumo("Ça me semble bon.\n\n@numo")).toBe(true);
    expect(mentionsNumo("> un avis ?\n@numo qu'en penses-tu")).toBe(true);
    expect(mentionsNumo("(@numo)")).toBe(true);
  });

  it("ne se déclenche pas sur une adresse e-mail", () => {
    expect(mentionsNumo("écrivez à contact@numo.dev")).toBe(false);
  });

  it("ne se déclenche pas sur un mot qui COMMENCE par numo", () => {
    expect(mentionsNumo("@numotron a poussé un commit")).toBe(false);
  });

  it("ignore un texte qui parle de Numo sans l'appeler", () => {
    expect(mentionsNumo("Numo a ouvert cette PR hier")).toBe(false);
    expect(mentionsNumo("la review de numo est passée")).toBe(false);
  });

  it("le reconnaît dans un message qui porte aussi des mentions de forge", () => {
    expect(mentionsNumo("@mangue-dev et @numo, un avis ?")).toBe(true);
  });
});

describe("forgeAttachmentMarkdown", () => {
  const url = "https://xyz.supabase.co/storage/v1/object/public/forge-attachments/a/b/x.png";

  it("insère une image, pour qu'elle se regarde dans le fil", () => {
    expect(forgeAttachmentMarkdown({ url, name: "capture.png", isImage: true })).toBe(
      `![capture.png](${url})`,
    );
  });

  it("lie tout le reste — un `![]()` sur un PDF ne donnerait qu'une icône cassée", () => {
    expect(forgeAttachmentMarkdown({ url, name: "trace.log", isImage: false })).toBe(
      `[trace.log](${url})`,
    );
  });

  it("désarme les crochets d'un nom de fichier, qui casseraient le lien", () => {
    expect(
      forgeAttachmentMarkdown({ url, name: "capture [1].png", isImage: true }),
    ).toBe(`![capture 1.png](${url})`);
  });
});
