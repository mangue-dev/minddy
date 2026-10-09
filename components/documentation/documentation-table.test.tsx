// @vitest-environment jsdom
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { expect, it, vi } from "vitest";
import { DocumentationTable } from "./documentation-table";
import { DocumentationDiagram } from "./documentation-diagram";
import type { DocumentationDiagram as Diagram, DocumentationFigure } from "@/lib/documentation";

vi.mock("mangue-ui", () => import("mangue-ui/lib/utils"));

it("keeps Markdown links, code and alignment in an accessible table", () => {
  const html = renderToStaticMarkup(<ReactMarkdown remarkPlugins={[remarkGfm]} components={{
    table: ({ children }) => <DocumentationTable label="Connection options">{children}</DocumentationTable>,
  }}>{"| Connection | Scope |\n| :--- | ---: |\n| [MCP](/mcp) | `personal` |"}</ReactMarkdown>);
  const host = document.createElement("div"); host.innerHTML = html;
  expect(host.querySelector('[role="region"]')?.getAttribute("tabindex")).toBe("0");
  expect(host.querySelector("caption")?.textContent).toBe("Connection options");
  expect(host.querySelectorAll('thead th[scope="col"]')).toHaveLength(2);
  expect(host.querySelector('tbody th[scope="row"] a')?.getAttribute("href")).toBe("/mcp");
  expect(host.querySelector("tbody td code")?.textContent).toBe("personal");
  expect((host.querySelector("tbody td") as HTMLElement).style.textAlign).toBe("right");
});

function diagram(layout: Diagram) {
  const figure: DocumentationFigure & { diagram: Diagram } = {
    id: "example", kind: "diagram", src: "/documentation/en/example.svg", alt: "Example", caption: "Example caption",
    revision: 1, reviewed: true, capturedAt: "2026-10-09", viewport: [720, 400], theme: "neutral", diagram: layout,
  };
  const host = document.createElement("div"); host.innerHTML = renderToStaticMarkup(<DocumentationDiagram figure={figure} />);
  return host;
}

it("uses numbered steps only for sequences and native cells for matrices", () => {
  const items = [{ title: "Read" }, { title: "Review" }];
  expect(diagram({ layout: "collection", items }).querySelectorAll("[aria-hidden]")).toHaveLength(0);
  expect([...diagram({ layout: "sequence", items }).querySelectorAll("[aria-hidden]")].map(el => el.textContent)).toEqual(["1", "↓", "2"]);
  const matrix = diagram({ layout: "matrix", headers: ["Action", "Member", "Owner"], rows: [["Manage", "No", "Yes"]] });
  expect(matrix.querySelectorAll("table")).toHaveLength(1);
  expect(matrix.querySelector('th[scope="row"]')?.textContent).toBe("Manage");
  expect(matrix.querySelectorAll("tbody td")).toHaveLength(2);
});
