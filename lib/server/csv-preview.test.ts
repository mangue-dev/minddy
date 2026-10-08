import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import {
  CSV_PREVIEW_MAX_CELL_CHARACTERS,
  CSV_PREVIEW_MAX_COLUMNS,
  CSV_PREVIEW_MAX_ROWS,
  renderCsvPreview,
} from "@/lib/server/csv-preview";

const options = {
  fileName: "export.csv",
  locale: "en",
  emptyMessage: "This CSV is empty.",
  truncatedMessage: "This preview is shortened. Download the CSV to see all data.",
};

function preview(csv: string, overrides = {}) {
  return new JSDOM(renderCsvPreview(new TextEncoder().encode(csv), ["text/csv"],
    { ...options, ...overrides })).window.document;
}

function cells(document: Document, selector: string) {
  return [...document.querySelectorAll(selector)].map((cell) => cell.textContent);
}

describe("CSV table previews", () => {
  it.each([",", ";", "\t", "|"])("detects the %j delimiter", (delimiter) => {
    const document = preview(`Name${delimiter}Count\r\nMinddy${delimiter}0016\r\n`);
    expect(cells(document, "th")).toEqual(["Name", "Count"]);
    expect(cells(document, "td")).toEqual(["Minddy", "0016"]);
    expect(document.querySelector(".notice")).toBeNull();
  });

  it("keeps quoted delimiters, escaped quotes, multiline cells and formulas as text", () => {
    const document = preview('Name,Notes,Formula\n"Doe, Jane","Line one\n""quoted"" line two",=1+1\n');
    expect(cells(document, "td")).toEqual(["Doe, Jane", 'Line one\n"quoted" line two', "=1+1"]);
  });

  it("pads uneven records without discarding extra fields or empty cells", () => {
    const document = preview("A,B\n1,2,3\n4\n,6,\n");
    expect(cells(document, "th")).toEqual(["A", "B", ""]);
    expect(cells(document, "td")).toEqual(["1", "2", "3", "4", "", "", "", "6", ""]);
  });

  it("supports a single-column file and preserves header-only content", () => {
    expect(cells(preview("Name\nMinddy\n"), "td")).toEqual(["Minddy"]);
    const document = preview("Name,Count");
    expect(cells(document, "th")).toEqual(["Name", "Count"]);
    expect(document.querySelector("tbody tr")).toBeNull();
  });

  it.each(["", "\n\r\n", "\uFEFF"])("shows the localized empty message for %j", (csv) => {
    const document = preview(csv, { emptyMessage: "No CSV records.", locale: "de" });
    expect(document.querySelector(".empty")?.textContent).toBe("No CSV records.");
    expect(document.documentElement.lang).toBe("de");
    expect(document.querySelector("table")).toBeNull();
  });

  it("escapes file content, names, language attributes and localized messages", () => {
    const payload = '</div><script>alert("csv")</script><img src=x onerror=alert(1)>&';
    const document = preview(`Header\n${payload}`, {
      fileName: payload,
      locale: 'en" onload="alert(1)',
    });
    expect(cells(document, "td")).toEqual([payload]);
    expect(document.title).toBe(payload);
    expect(document.querySelector("table")?.getAttribute("aria-label")).toBe(payload);
    expect(document.querySelector("script, img, [onload], [onerror]")).toBeNull();
    expect(preview("", { emptyMessage: payload }).querySelector(".empty")?.textContent).toBe(payload);
  });

  it("limits data rows, keeps the header and announces shortened previews", () => {
    const csv = ["Name", ...Array.from({ length: CSV_PREVIEW_MAX_ROWS + 10 }, (_, i) => `Row ${i}`)].join("\n");
    const document = preview(csv);
    expect(document.querySelectorAll("tbody tr")).toHaveLength(CSV_PREVIEW_MAX_ROWS);
    expect(document.querySelector("tbody tr:last-child")?.textContent).toBe(`Row ${CSV_PREVIEW_MAX_ROWS - 1}`);
    expect(document.querySelector(".notice")?.textContent).toBe(options.truncatedMessage);
  });

  it("does not announce truncation at the exact row limit", () => {
    const csv = ["Name", ...Array.from({ length: CSV_PREVIEW_MAX_ROWS }, (_, i) => `Row ${i}`)].join("\n");
    expect(preview(csv).querySelector(".notice")).toBeNull();
    expect(preview(`${csv}\n`).querySelector(".notice")).toBeNull();
  });

  it("limits columns and oversized cells with an explicit notice", () => {
    const row = Array.from({ length: CSV_PREVIEW_MAX_COLUMNS + 1 }, (_, i) => `Column ${i}`).join(",");
    const document = preview(`${row}\n${"x".repeat(CSV_PREVIEW_MAX_CELL_CHARACTERS + 1)}`);
    expect(document.querySelectorAll("th")).toHaveLength(CSV_PREVIEW_MAX_COLUMNS);
    expect(document.querySelector("td")?.textContent).toBe(`${"x".repeat(CSV_PREVIEW_MAX_CELL_CHARACTERS)}…`);
    expect(document.querySelector(".notice")?.textContent).toBe(options.truncatedMessage);
  });

  it("bounds total rendered text even when many cells reach the individual limit", () => {
    const row = Array.from({ length: 100 }, () => "x".repeat(2_000)).join(",");
    const document = preview(["Header", ...Array.from({ length: 10 }, () => row)].join("\n"));
    expect(document.querySelector("tbody")!.textContent!.length).toBeLessThan(1_001_000);
    expect(document.querySelectorAll("tbody tr").length).toBeLessThan(10);
    expect(document.querySelector(".notice")?.textContent).toBe(options.truncatedMessage);
  });
});
