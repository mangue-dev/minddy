import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { Markdown } from "@/components/markdown";
import type { MentionLinks } from "@/components/mention-links";
import type { AssistantMention } from "@/lib/assistant-types";

vi.mock("mangue-ui", () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(" "),
}));

describe("markdown persisted mentions", () => {
  it("renders saved identities without relying on live mention sources", () => {
    const resolvedMentions: AssistantMention[] = [
      {
        type: "objective",
        id: "objective-roadmap",
        label: "Roadmap",
      },
      {
        type: "page",
        id: "page-roadmap",
        label: "Roadmap",
      },
      {
        type: "objective",
        id: "objective-roadmap",
        label: "Roadmap",
      },
    ];
    const mentionLinks: MentionLinks = {
      href: (type, id) => `/${type}/${id}`,
      navigate: () => {},
    };

    const html = renderToStaticMarkup(
      createElement(Markdown, {
        children: "Plan @Roadmap, document **@Roadmap**, revisit _@Roadmap_",
        resolvedMentions,
        mentionLinks,
      }),
    );

    expect(html).toContain('href="/objective/objective-roadmap"');
    expect(html).toContain('href="/page/page-roadmap"');
    expect(html.match(/href="\/objective\/objective-roadmap"/g)).toHaveLength(
      2,
    );
  });
});
