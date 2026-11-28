import { describe, expect, it } from "vitest";
import type { ComponentPropsWithoutRef } from "react";
import type { ExtraProps } from "react-markdown";
import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";
import { assistantMentionTarget, toAssistantMentionLinks } from "@/lib/assistant-mention-links";

const PROJECT = "1c3d6ee5-cbdc-4cd6-86e2-76abdd518a72";
const ISSUE = "ae3b4217-ab41-497d-9f20-edf12b8513a0";

/** The hrefs Streamdown hands its link renderer for this Markdown. */
function renderedTargets(markdown: string) {
  const html = renderToStaticMarkup(
    <Streamdown
      components={{
        a: (props: ComponentPropsWithoutRef<"a"> & ExtraProps) => {
          const target = assistantMentionTarget(props.href);
          return <span data-target={target ? `${target.type}/${target.id}` : `link:${props.href}`} />;
        },
      }}
    >
      {toAssistantMentionLinks(markdown)}
    </Streamdown>,
  );
  return [...html.matchAll(/data-target="([^"]*)"/g)].map((match) => match[1]);
}

describe("assistant mention links", () => {
  it("reads back the mentions Streamdown's sanitizer clobbers", () => {
    const content = `Today, [@](mention:project/${PROJECT}) counts 16 open issues; [@](mention:issue/${ISSUE}) waits.`;
    expect(renderedTargets(content)).toEqual([`project/${PROJECT}`, `issue/${ISSUE}`]);
  });

  it("keeps metadata and older labeled mentions", () => {
    expect(renderedTargets(`[@MIN-4](mention:issue/${ISSUE}?part=plan)`)).toEqual([`issue/${ISSUE}`]);
    expect(assistantMentionTarget(`#user-content-mention:issue/${ISSUE}?part=plan`)).toEqual({
      type: "issue",
      id: ISSUE,
      meta: { part: "plan" },
    });
  });

  it("leaves other links and in-page anchors alone", () => {
    expect(renderedTargets("[docs](https://example.com) and [top](#top)")).toEqual([
      "link:https://example.com/",
      "link:#user-content-top",
    ]);
    expect(assistantMentionTarget("#user-content-mention:unknown/x")).toBeNull();
    expect(assistantMentionTarget(undefined)).toBeNull();
  });
});
