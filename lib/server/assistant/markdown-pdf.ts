import "server-only";

import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";

/**
 * Markdown → PDF for the files Numo writes (MIN-793).
 *
 * Runs inside the serverless function, with no browser and no font file: the
 * fourteen standard PDF fonts ship with every reader, so the document needs
 * nothing embedded. Their WinAnsi encoding covers Western European text,
 * typographic quotes, dashes, the bullet and the euro sign; any other
 * character is reduced to its base letter when it has one, dropped when it is
 * an emoji, and replaced by "?" otherwise ({@link toWinAnsi}).
 *
 * The model writes Markdown, so the parser takes the subset a document needs:
 * headings, paragraphs, bullet, numbered and task lists, quotes, fenced code,
 * tables, rules, and inline bold, italic, code and links. Anything else is
 * printed as text, never dropped.
 */

export type MarkdownBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: { text: string; depth: number; marker: string }[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; lines: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "rule" };

const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

/** Block structure of a Markdown document; see the module comment for the subset. */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  const startsBlock = (line: string, next?: string) =>
    /^\s*(#{1,6}\s|```|~~~|>|([-*_])\s*\2\s*\2[\s\-*_]*$)/.test(line) ||
    LIST_ITEM.test(line) ||
    (line.includes("|") && next !== undefined && TABLE_DIVIDER.test(next));

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index++; continue; }

    const fence = /^\s*(```|~~~)/.exec(line);
    if (fence) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].trimStart().startsWith(fence[1])) {
        code.push(lines[index]);
        index++;
      }
      index++;
      blocks.push({ kind: "code", lines: code });
      continue;
    }

    const heading = /^\s*(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      index++;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      blocks.push({ kind: "rule" });
      index++;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && TABLE_DIVIDER.test(lines[index + 1])) {
      const rows = [tableCells(line)];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(tableCells(lines[index]));
        index++;
      }
      blocks.push({ kind: "table", rows });
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoted.push(lines[index].replace(/^\s*>\s?/, ""));
        index++;
      }
      blocks.push({ kind: "quote", text: quoted.join(" ") });
      continue;
    }

    const first = LIST_ITEM.exec(line);
    if (first) {
      const ordered = /\d/.test(first[2]);
      const items: { text: string; depth: number; marker: string }[] = [];
      while (index < lines.length) {
        const item = LIST_ITEM.exec(lines[index]);
        if (item) {
          const depth = Math.min(4, Math.floor(item[1].replace(/\t/g, "    ").length / 2));
          let text = item[3];
          let marker = /\d/.test(item[2]) ? item[2].replace(")", ".") : "•";
          const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
          if (task) {
            marker = task[1] === " " ? "[ ]" : "[x]";
            text = task[2];
          }
          items.push({ text, depth, marker });
          index++;
        } else if (lines[index].trim() && /^\s+/.test(lines[index]) && items.length) {
          // A wrapped continuation line belongs to the item above it.
          items[items.length - 1].text += ` ${lines[index].trim()}`;
          index++;
        } else {
          break;
        }
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [line.trim()];
    index++;
    while (index < lines.length && lines[index].trim() &&
        !startsBlock(lines[index], lines[index + 1])) {
      paragraph.push(lines[index].trim());
      index++;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }
  return blocks;
}

export type InlineStyle = "regular" | "bold" | "italic" | "boldItalic" | "code";
export type InlineRun = { text: string; style: InlineStyle };

/** Bold, italic, code spans and links; a link keeps its text and its address. */
export function parseInline(text: string, base: "regular" | "bold" = "regular"): InlineRun[] {
  const runs: InlineRun[] = [];
  const pattern = /(`+)([\s\S]*?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\s][\s\S]*?)\*|(?<![\w])_([^_\s][\s\S]*?)_(?![\w])|!?\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const bold = (style: InlineStyle): InlineStyle =>
    style === "italic" || style === "boldItalic" ? "boldItalic" : "bold";
  const italic = (style: InlineStyle): InlineStyle =>
    style === "bold" || style === "boldItalic" ? "boldItalic" : "italic";
  let last = 0;
  const push = (value: string, style: InlineStyle) => {
    const clean = value.replace(/\\([\\`*_[\]()#+\-.!|>~])/g, "$1");
    if (clean) runs.push({ text: clean, style });
  };
  for (const match of text.matchAll(pattern)) {
    push(text.slice(last, match.index), base);
    if (match[2] !== undefined) runs.push({ text: match[2].trim() || match[2], style: "code" });
    else if (match[3] !== undefined || match[4] !== undefined) {
      for (const run of parseInline(match[3] ?? match[4], "bold")) {
        runs.push(run.style === "code" ? run : { ...run, style: bold(run.style) });
      }
    } else if (match[5] !== undefined || match[6] !== undefined) {
      for (const run of parseInline(match[5] ?? match[6], base)) {
        runs.push(run.style === "code" ? run : { ...run, style: italic(run.style) });
      }
    } else if (match[8] !== undefined) {
      const label = match[7].trim();
      const url = match[8];
      push(label && label !== url ? `${label} (${url})` : url, base);
    }
    last = match.index + match[0].length;
  }
  push(text.slice(last), base);
  return runs;
}

const PICTOGRAPH = /\p{Extended_Pictographic}/u;
/** Variation selectors, joiner, keycap and skin tones: parts of an emoji. */
const isEmojiPart = (code: number) => code === 0xfe0e || code === 0xfe0f ||
  code === 0x200d || code === 0x20e3 || (code >= 0x1f3fb && code <= 0x1f3ff);

/** Text the standard fonts can encode; see the module comment. */
export function toWinAnsi(text: string, supported: ReadonlySet<number>): string {
  let out = "";
  for (const char of text.replace(/\t/g, "    ")) {
    const code = char.codePointAt(0)!;
    if (supported.has(code)) { out += char; continue; }
    if (char === "\u00a0" || char === "\u202f") { out += " "; continue; }
    if (PICTOGRAPH.test(char) || isEmojiPart(code)) continue;
    const base = char.normalize("NFKD").replace(/\p{M}/gu, "");
    out += base && [...base].every((c) => supported.has(c.codePointAt(0)!)) ? base : "?";
  }
  return out;
}

const PAGE = { width: 595.28, height: 841.89, margin: 56 };
const BODY = 10.5;
const LEADING = 1.45;
const INK = rgb(0.11, 0.11, 0.13);
const MUTED = rgb(0.42, 0.42, 0.46);
const LINE = rgb(0.85, 0.85, 0.88);
const CODE_FILL = rgb(0.955, 0.955, 0.965);
const HEADING_SIZES = [20, 16, 13.5, 12, 11, 10.5];

type Fonts = Record<InlineStyle, PDFFont>;
type Word = { text: string; font: PDFFont; size: number; space: boolean };

class Layout {
  page!: PDFPage;
  y = 0;
  constructor(private readonly doc: PDFDocument, readonly fonts: Fonts,
    private readonly supported: ReadonlySet<number>) {
    this.addPage();
  }

  addPage() {
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - PAGE.margin;
  }

  ensure(height: number) {
    if (this.y - height < PAGE.margin) this.addPage();
  }

  clean(text: string) {
    return toWinAnsi(text, this.supported);
  }

  /** Words of styled runs, each knowing whether a space precedes it. */
  words(runs: InlineRun[], size: number): Word[] {
    const words: Word[] = [];
    let pendingSpace = false;
    for (const run of runs) {
      const font = this.fonts[run.style];
      const runSize = run.style === "code" ? size * 0.92 : size;
      for (const part of this.clean(run.text).split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { pendingSpace = words.length > 0; continue; }
        words.push({ text: part, font, size: runSize, space: pendingSpace });
        pendingSpace = false;
      }
    }
    return words;
  }

  /** Greedy line breaking; a word wider than the line is cut by characters. */
  lines(words: Word[], width: number): Word[][] {
    const lines: Word[][] = [];
    let line: Word[] = [];
    let used = 0;
    for (const original of words) {
      let word = original;
      for (;;) {
        const space = line.length && word.space ? word.font.widthOfTextAtSize(" ", word.size) : 0;
        const w = word.font.widthOfTextAtSize(word.text, word.size);
        if (used + space + w <= width) {
          line.push(word);
          used += space + w;
          break;
        }
        if (line.length) { lines.push(line); line = []; used = 0; continue; }
        let cut = word.text.length - 1;
        while (cut > 1 && word.font.widthOfTextAtSize(word.text.slice(0, cut), word.size) > width) cut--;
        lines.push([{ ...word, text: word.text.slice(0, cut) }]);
        word = { ...word, text: word.text.slice(cut), space: false };
      }
    }
    if (line.length) lines.push(line);
    return lines;
  }

  /** Draws wrapped runs; returns nothing, moves the cursor below them. */
  text(runs: InlineRun[], { x = PAGE.margin, width = PAGE.width - 2 * PAGE.margin,
    size = BODY, color = INK, after = BODY * 0.7, prefix }:
    { x?: number; width?: number; size?: number; color?: ReturnType<typeof rgb>;
      after?: number; prefix?: { text: string; font: PDFFont; width: number } } = {}) {
    const lineHeight = size * LEADING;
    const lines = this.lines(this.words(runs, size), width);
    if (!lines.length && prefix) lines.push([]);
    lines.forEach((line, lineIndex) => {
      this.ensure(lineHeight);
      const baseline = this.y - size;
      if (prefix && lineIndex === 0) {
        this.page.drawText(this.clean(prefix.text), { x: x - prefix.width, y: baseline,
          size, font: prefix.font, color });
      }
      let cursor = x;
      for (const [wordIndex, word] of line.entries()) {
        if (wordIndex && word.space) cursor += word.font.widthOfTextAtSize(" ", word.size);
        this.page.drawText(word.text, { x: cursor, y: baseline, size: word.size, font: word.font, color });
        cursor += word.font.widthOfTextAtSize(word.text, word.size);
      }
      this.y -= lineHeight;
    });
    this.y -= after;
  }
}

function drawTable(layout: Layout, rows: string[][]) {
  const columns = Math.max(...rows.map((row) => row.length));
  const width = PAGE.width - 2 * PAGE.margin;
  const pad = 4;
  const size = BODY * 0.92;
  const lineHeight = size * LEADING;
  // Columns share the width by their longest cell, each keeping at least half
  // of an equal share, so a long title column does not wrap beside short ones.
  const natural = Array.from({ length: columns }, (_, column) => Math.max(1, ...rows.map((row, rowIndex) =>
    layout.words(parseInline(row[column] ?? "", rowIndex === 0 ? "bold" : "regular"), size)
      .reduce((sum, word) => sum + word.font.widthOfTextAtSize(`${word.text} `, word.size), 0))));
  const floor = width / columns / 2;
  const total = natural.reduce((sum, value) => sum + value, 0);
  const widths = natural.map((value) => floor + (width - floor * columns) * (value / total));
  const offsets = widths.map((_, column) => widths.slice(0, column).reduce((sum, value) => sum + value, 0));
  for (const [rowIndex, row] of rows.entries()) {
    const cells = Array.from({ length: columns }, (_, column) =>
      layout.lines(layout.words(parseInline(row[column] ?? "", rowIndex === 0 ? "bold" : "regular"), size),
        widths[column] - 2 * pad));
    const height = Math.max(1, ...cells.map((cell) => cell.length)) * lineHeight + 2 * pad;
    layout.ensure(height);
    const top = layout.y;
    if (rowIndex === 0) {
      layout.page.drawRectangle({ x: PAGE.margin, y: top - height, width, height, color: CODE_FILL });
    }
    cells.forEach((lines, column) => {
      lines.forEach((line, lineIndex) => {
        let cursor = PAGE.margin + offsets[column] + pad;
        for (const [wordIndex, word] of line.entries()) {
          if (wordIndex && word.space) cursor += word.font.widthOfTextAtSize(" ", word.size);
          layout.page.drawText(word.text, { x: cursor, y: top - pad - size - lineIndex * lineHeight,
            size: word.size, font: word.font, color: INK });
          cursor += word.font.widthOfTextAtSize(word.text, word.size);
        }
      });
    });
    layout.page.drawLine({ start: { x: PAGE.margin, y: top - height },
      end: { x: PAGE.margin + width, y: top - height }, thickness: 0.6, color: LINE });
    layout.y = top - height;
  }
  layout.y -= BODY * 0.9;
}

/** Renders Markdown into a paginated A4 PDF titled `title`. */
export async function renderMarkdownPdf(markdown: string, title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    italic: await doc.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await doc.embedFont(StandardFonts.HelveticaBoldOblique),
    code: await doc.embedFont(StandardFonts.Courier),
  };
  const supported = new Set(fonts.regular.getCharacterSet());
  doc.setTitle(toWinAnsi(title, supported));
  doc.setCreator("minddy");
  doc.setProducer("minddy");
  const layout = new Layout(doc, fonts, supported);
  const contentWidth = PAGE.width - 2 * PAGE.margin;

  for (const block of parseMarkdownBlocks(markdown)) {
    switch (block.kind) {
      case "heading": {
        const size = HEADING_SIZES[block.level - 1];
        layout.ensure(size * 3);
        if (layout.y < PAGE.height - PAGE.margin) layout.y -= size * 0.5;
        layout.text(parseInline(block.text, "bold"), { size, after: size * 0.35 });
        break;
      }
      case "paragraph":
        layout.text(parseInline(block.text));
        break;
      case "quote": {
        const top = layout.y;
        const page = layout.page;
        layout.text(parseInline(block.text), { x: PAGE.margin + 14, width: contentWidth - 14,
          color: MUTED, after: 0 });
        if (layout.page === page) {
          page.drawLine({ start: { x: PAGE.margin + 3, y: top }, end: { x: PAGE.margin + 3, y: layout.y },
            thickness: 2, color: LINE });
        }
        layout.y -= BODY * 0.7;
        break;
      }
      case "list": {
        let number = 0;
        for (const item of block.items) {
          const indent = 18 + item.depth * 16;
          const marker = /^\d/.test(item.marker) ? `${++number}.` : item.marker;
          const font = marker === "•" ? fonts.bold : fonts.regular;
          layout.text(parseInline(item.text), {
            x: PAGE.margin + indent,
            width: contentWidth - indent,
            after: BODY * 0.25,
            prefix: { text: marker, font, width: font.widthOfTextAtSize(marker, BODY) + 6 },
          });
        }
        layout.y -= BODY * 0.45;
        break;
      }
      case "code": {
        const size = BODY * 0.88;
        const lineHeight = size * 1.35;
        const maxChars = Math.max(1, Math.floor((contentWidth - 16) / fonts.code.widthOfTextAtSize("M", size)));
        const lines = block.lines.flatMap((line) => {
          const clean = layout.clean(line);
          const parts: string[] = [];
          for (let i = 0; i < clean.length; i += maxChars) parts.push(clean.slice(i, i + maxChars));
          return parts.length ? parts : [""];
        });
        for (const [lineIndex, line] of lines.entries()) {
          const first = lineIndex === 0;
          const last = lineIndex === lines.length - 1;
          const height = lineHeight + (first ? 6 : 0) + (last ? 6 : 0);
          layout.ensure(height);
          layout.page.drawRectangle({ x: PAGE.margin, y: layout.y - height, width: contentWidth,
            height, color: CODE_FILL });
          layout.page.drawText(line, { x: PAGE.margin + 8, y: layout.y - (first ? 6 : 0) - size,
            size, font: fonts.code, color: INK });
          layout.y -= height;
        }
        layout.y -= BODY * 0.8;
        break;
      }
      case "table":
        drawTable(layout, block.rows);
        break;
      case "rule":
        layout.ensure(BODY * 2);
        layout.y -= BODY * 0.6;
        layout.page.drawLine({ start: { x: PAGE.margin, y: layout.y },
          end: { x: PAGE.width - PAGE.margin, y: layout.y }, thickness: 0.6, color: LINE });
        layout.y -= BODY;
        break;
    }
  }

  const pages = doc.getPages();
  if (pages.length > 1) {
    pages.forEach((page, index) => {
      const label = `${index + 1} / ${pages.length}`;
      page.drawText(label, { x: (PAGE.width - fonts.regular.widthOfTextAtSize(label, 8.5)) / 2,
        y: PAGE.margin / 2, size: 8.5, font: fonts.regular, color: MUTED });
    });
  }
  return doc.save();
}
