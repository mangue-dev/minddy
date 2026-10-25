import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";

vi.mock("server-only", () => ({}));

const { generatedFileName, renderGeneratedFile, startsWithSvgElement } = await import("./generated-files");
const { parseInline, parseMarkdownBlocks, renderMarkdownPdf, toWinAnsi } = await import("./markdown-pdf");
const { generatedFileFromResult, generatedFileMimeType, generatedFileUrl } = await import("@/lib/generated-files");

const USER = "11111111-1111-4111-8111-111111111111";
const OBJECT = "22222222-2222-4222-8222-222222222222";

describe("generatedFileName", () => {
  it("keeps a readable name, without a path, ending with the format", () => {
    expect(generatedFileName("Rapport: Q3/Q4", "pdf")).toBe("Rapport Q3 Q4.pdf");
    expect(generatedFileName("export.csv", "csv")).toBe("export.csv");
    expect(generatedFileName("export.csv", "pdf")).toBe("export.pdf");
    expect(generatedFileName("release.v2", "md")).toBe("release.v2.md");
    expect(generatedFileName("...", "txt")).toBe("numo.txt");
    expect(generatedFileName(undefined, "json")).toBe("numo.json");
    expect(generatedFileName("x".repeat(300), "txt")).toHaveLength(124);
  });
});

describe("renderGeneratedFile", () => {
  const text = async (bytes: Promise<Uint8Array>) =>
    new TextDecoder("utf-8", { ignoreBOM: true }).decode(await bytes);

  it("writes text formats as given, with a byte order mark for spreadsheets", async () => {
    expect(await text(renderGeneratedFile("md", "# Titre", "a.md"))).toBe("# Titre");
    expect(await text(renderGeneratedFile("csv", "\ufeffa,b", "a.csv"))).toBe("\ufeffa,b");
    expect(await text(renderGeneratedFile("ics", "BEGIN:VCALENDAR\nEND:VCALENDAR", "a.ics")))
      .toBe("BEGIN:VCALENDAR\r\nEND:VCALENDAR");
    expect(await text(renderGeneratedFile("svg", '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>', "a.svg")))
      .toContain("<svg");
  });

  it("finds the SVG element after a prolog and comments, in linear time", () => {
    expect(startsWithSvgElement('<?xml version="1.0"?>\n<!-- a --><!-- b -->\n<svg width="1"/>')).toBe(true);
    expect(startsWithSvgElement("<svg/>")).toBe(true);
    expect(startsWithSvgElement("<!-- unclosed <svg>")).toBe(false);
    expect(startsWithSvgElement("<svgx>")).toBe(false);
    const hostile = `<!--${"--><!--".repeat(50_000)}`;
    const started = performance.now();
    expect(startsWithSvgElement(hostile)).toBe(false);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("refuses content that breaks its format's grammar", async () => {
    await expect(renderGeneratedFile("json", "{", "a.json")).rejects.toThrow("JSON");
    await expect(renderGeneratedFile("svg", "<html>", "a.svg")).rejects.toThrow("SVG");
    await expect(renderGeneratedFile("ics", "hello", "a.ics")).rejects.toThrow("iCalendar");
  });
});

describe("Markdown for PDF", () => {
  it("reads the block structure a document needs", () => {
    const blocks = parseMarkdownBlocks([
      "# Title", "", "A paragraph", "on two lines.", "",
      "- one", "  - nested", "- [x] done", "", "1. first", "2. second", "",
      "> quoted", "", "```ts", "const a = 1;", "```", "",
      "| Name | Usage |", "| --- | ---: |", "| Café | 16 |", "", "---",
    ].join("\n"));
    expect(blocks).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      { kind: "paragraph", text: "A paragraph on two lines." },
      { kind: "list", ordered: false, items: [
        { text: "one", depth: 0, marker: "•" },
        { text: "nested", depth: 1, marker: "•" },
        { text: "done", depth: 0, marker: "[x]" },
      ] },
      { kind: "list", ordered: true, items: [
        { text: "first", depth: 0, marker: "1." },
        { text: "second", depth: 0, marker: "2." },
      ] },
      { kind: "quote", text: "quoted" },
      { kind: "code", lines: ["const a = 1;"] },
      { kind: "table", rows: [["Name", "Usage"], ["Café", "16"]] },
      { kind: "rule" },
    ]);
  });

  it("styles inline runs and keeps a link's address", () => {
    expect(parseInline("a **bold _both_** `code` [site](https://minddy.app)")).toEqual([
      { text: "a ", style: "regular" },
      { text: "bold ", style: "bold" },
      { text: "both", style: "boldItalic" },
      { text: " ", style: "regular" },
      { text: "code", style: "code" },
      { text: " ", style: "regular" },
      { text: "site (https://minddy.app)", style: "regular" },
    ]);
    expect(parseInline("snake_case_name stays")).toEqual([{ text: "snake_case_name stays", style: "regular" }]);
  });

  it("reduces text to what the standard fonts encode", () => {
    const winAnsi = new Set([..." ?abcdefknoz€•’éÉ"].map((c) => c.codePointAt(0)!));
    expect(toWinAnsi("café ’ € •", winAnsi)).toBe("café ’ € •");
    expect(toWinAnsi("ő ž", winAnsi)).toBe("o z");
    expect(toWinAnsi("ok 🚀👍🏽 done", winAnsi)).toBe("ok  done");
    expect(toWinAnsi("中", winAnsi)).toBe("?");
  });

  it("renders a valid, paginated PDF whatever the characters", async () => {
    const markdown = [
      "# Rapport d’activité — Q3", "", "Texte **gras**, *italique*, `code`, emoji 🚀 et 中文.", "",
      "| Colonne | Valeur |", "| --- | --- |", "| Café | 16 € |", "",
      ...Array.from({ length: 120 }, (_, i) => `- élément ${i} avec un texte assez long pour passer à la ligne suivante dans la page`),
      "", "```", "x".repeat(400), "```",
    ].join("\n");
    const bytes = await renderMarkdownPdf(markdown, "Rapport");
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(doc.getTitle()).toBe("Rapport");
  });
});

describe("generated file results", () => {
  const result = {
    attachment_id: `numo:${OBJECT}`, file_name: "a.pdf", format: "pdf",
    mime_type: "application/pdf", size_bytes: 12, storage_path: `chat/${USER}/${OBJECT}`,
    note: "for the model",
  };

  it("reads a create_file result and nothing else", () => {
    expect(generatedFileFromResult(result)).toEqual({
      attachment_id: `numo:${OBJECT}`, file_name: "a.pdf", format: "pdf",
      mime_type: "application/pdf", size_bytes: 12, storage_path: `chat/${USER}/${OBJECT}`,
    });
    expect(generatedFileFromResult({ error: "content is required." })).toBeNull();
    expect(generatedFileFromResult({ ...result, storage_path: `projects/${USER}/${OBJECT}` })).toBeNull();
    expect(generatedFileFromResult({ ...result, format: "exe" })).toBeNull();
  });

  it("names the file in its same-origin address", () => {
    expect(generatedFileUrl(result, "download")).toBe(
      `/api/attachments/file?path=chat%2F${USER}%2F${OBJECT}&name=a.pdf&download=1`);
  });

  it("types only the generated extensions", () => {
    expect(generatedFileMimeType("Export.CSV")).toBe("text/csv");
    expect(generatedFileMimeType("page.htm")).toBeNull();
    expect(generatedFileMimeType("noextension")).toBeNull();
  });
});
