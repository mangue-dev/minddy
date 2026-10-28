import { describe, expect, it } from "vitest";
import { stripTranscriptionHallucinations } from "./dictation-hallucinations";

// The hallucinated phrases are intentionally multilingual fixtures: they are
// what speech models emit, in the language they emit them.
describe("stripTranscriptionHallucinations", () => {
  it.each([
    "Sous-titrage Société Radio-Canada",
    "Sous-titres réalisés par la communauté d'Amara.org",
    "Sous-titrage ST' 501",
    "Subtitles by the Amara.org community",
    "Untertitel im Auftrag des ZDF für funk, 2017",
    "Untertitel der Amara.org-Community",
    "Subtítulos realizados por la comunidad de Amara.org",
    "Sottotitoli creati dalla comunità Amara.org",
    "Legendas pela comunidade Amara.org",
    "Ondertiteling door de Amara.org gemeenschap",
    "Napisy stworzone przez społeczność Amara.org",
    "Transcribed by https://otter.ai",
    "Редактор субтитров А.Синецкая Корректор А.Егорова",
    "字幕由Amara.org社区提供",
    "请不吝点赞 订阅 转发 打赏支持明镜与点点栏目",
    "Merci.",
    "Thanks for watching!",
    "Vielen Dank fürs Zuschauen!",
    "ご視聴ありがとうございました",
    "시청해주셔서 감사합니다.",
    "you",
  ])("empties a take that is only %j", (hallucination) => {
    expect(stripTranscriptionHallucinations(hallucination)).toBe("");
  });

  it("removes a credit line wherever it appears", () => {
    expect(
      stripTranscriptionHallucinations(
        "Ajoute un filtre par statut. Sous-titrage Société Radio-Canada. Et trie par date.",
      ),
    ).toBe("Ajoute un filtre par statut. Et trie par date.");
  });

  it("removes sign-offs and credits stacked at the edges", () => {
    expect(
      stripTranscriptionHallucinations(
        "Merci. Le bouton d'export ne répond plus.\nMerci d'avoir regardé cette vidéo ! Sous-titres réalisés par la communauté d'Amara.org",
      ),
    ).toBe("Le bouton d'export ne répond plus.");
    expect(stripTranscriptionHallucinations("Fix the login page. Thank you for watching.")).toBe(
      "Fix the login page.",
    );
  });

  it("splits CJK sentences without spaces", () => {
    expect(stripTranscriptionHallucinations("ログインできません。ご視聴ありがとうございました。")).toBe(
      "ログインできません。",
    );
  });

  it("keeps a sign-off spoken inside the take", () => {
    const text = "Merci. Grâce à toi tout marche. Ajoute juste un export.";
    expect(stripTranscriptionHallucinations("Ajoute un export. Merci. Puis un import.")).toBe(
      "Ajoute un export. Merci. Puis un import.",
    );
    expect(stripTranscriptionHallucinations(text)).toBe(
      "Grâce à toi tout marche. Ajoute juste un export.",
    );
  });

  it("keeps sentences that only mention a source or subtitles", () => {
    for (const text of [
      "On utilise Amara.org pour traduire les vidéos.",
      "Les sous-titres de la vidéo sont décalés.",
      "Merci de corriger le bug avant vendredi.",
      "Thanks to the new cache, search is faster.",
    ]) {
      expect(stripTranscriptionHallucinations(text)).toBe(text);
    }
  });

  it("returns text with nothing to remove unchanged, whitespace included", () => {
    const text = "  Ajoute un export CSV.\n\nPuis un import.  ";
    expect(stripTranscriptionHallucinations(text)).toBe(text);
    expect(stripTranscriptionHallucinations("")).toBe("");
  });
});
