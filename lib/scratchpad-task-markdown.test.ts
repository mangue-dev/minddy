import { describe, expect, it } from "vitest";
import MarkdownIt from "markdown-it";
import { scratchpadTaskMarkdownIt } from "@/components/scratchpad/task-markdown";

/** Render markdown through only our task-marker rule (the parse half of the
    4-state round-trip; the serialize half is a plain marker map). */
function render(md: string): string {
  const it = new MarkdownIt();
  // Our plugin's minimal MarkdownIt shape is a structural subset of the real one.
  it.use(scratchpadTaskMarkdownIt as unknown as (md: MarkdownIt) => void);
  return it.render(md);
}

describe("scratchpadTaskMarkdownIt", () => {
  it("maps each of the four markers to a taskItem with its state", () => {
    const html = render("- [ ] a\n- [~] b\n- [x] c\n- [-] d");
    expect(html).toContain('data-type="taskList"');
    expect(html).toContain('data-type="taskItem" data-state="pending"');
    expect(html).toContain('data-state="in_progress"');
    expect(html).toContain('data-state="completed"');
    expect(html).toContain('data-state="cancelled"');
  });

  it("strips the marker from the rendered text", () => {
    const html = render("- [~] fix the header");
    expect(html).toContain("fix the header");
    expect(html).not.toContain("[~]");
  });

  it("supports uppercase [X] as completed", () => {
    expect(render("- [X] done")).toContain('data-state="completed"');
  });

  it("leaves a normal bullet untouched", () => {
    const html = render("- just a bullet");
    expect(html).not.toContain("data-type=");
    expect(html).toContain("just a bullet");
  });

  it("keeps inline formatting after the marker", () => {
    const html = render("- [ ] look at **this**");
    expect(html).toContain("<strong>this</strong>");
    expect(html).toContain('data-state="pending"');
  });
});
