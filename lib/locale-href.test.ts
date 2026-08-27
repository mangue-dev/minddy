import { describe, expect, it } from "vitest";
import { localizedHref, switchLocaleHref } from "./locale-href";

describe("localizedHref", () => {
  it("keeps landing anchors on each localized URL", () => {
    expect(localizedHref("/#faq", "de")).toBe("/de#faq");
    expect(localizedHref("/#faq", "pt-BR")).toBe("/pt-br#faq");
    expect(localizedHref("/#faq", "it")).toBe("/it#faq");
    expect(localizedHref("/#faq", "es")).toBe("/es#faq");
  });

  it("localizes links to translated public pages", () => {
    expect(localizedHref("/pricing", "de")).toBe("/de/preise");
    expect(localizedHref("/privacy", "pt-BR")).toBe("/pt-br/privacidade");
    expect(localizedHref("/download", "it")).toBe("/it/scarica");
    expect(localizedHref("/terms", "es")).toBe("/es/terminos");
  });
});

describe("switchLocaleHref", () => {
  it("switches between all landing variants", () => {
    expect(switchLocaleHref("/de", "pt-BR")).toBe("/pt-br");
    expect(switchLocaleHref("/pt-br", "fr")).toBe("/fr");
    expect(switchLocaleHref("/es", "en")).toBe("/");
  });
});
