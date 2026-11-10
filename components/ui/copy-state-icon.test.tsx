import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CopyStateIcon } from "./copy-state-icon";

/** The class list of each glyph, in order: the copy icon, then the check. */
function glyphs(copied: boolean, props: { copyClassName?: string; checkClassName?: string } = {}) {
  const html = renderToStaticMarkup(<CopyStateIcon copied={copied} {...props} />);
  return [...html.matchAll(/<svg[^>]*class="([^"]*)"/g)].map((match) => match[1].split(" "));
}

describe("CopyStateIcon", () => {
  it("keeps both glyphs mounted so they can cross-fade, and shows one", () => {
    const [copyIdle, checkIdle] = glyphs(false);
    expect(copyIdle).not.toContain("opacity-0");
    expect(checkIdle).toContain("opacity-0");

    const [copyDone, checkDone] = glyphs(true);
    expect(copyDone).toContain("opacity-0");
    expect(checkDone).not.toContain("opacity-0");
  });

  it("hides a glyph even when the call site gives it its own opacity", () => {
    const [copyDone] = glyphs(true, { copyClassName: "opacity-60" });
    expect(copyDone).toContain("opacity-0");
    expect(copyDone).not.toContain("opacity-60");
  });

  it("is decorative: the button around it carries the label", () => {
    expect(renderToStaticMarkup(<CopyStateIcon copied={false} />)).toMatch(/^<span[^>]*aria-hidden="true"/);
  });
});
