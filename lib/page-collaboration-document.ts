/**
 * The DOCUMENT half of live page collaboration (MIN-688): pure ProseMirror
 * operations shared by the editor and the operation authority.
 *
 * Two step streams exist per page. The BODY stream edits the ProseMirror
 * document built from `pageExtensions()`, the same schema as the editor and the
 * Markdown projection. The TITLE stream edits a one-line text document, so the
 * title textarea can rebase concurrent typing exactly like the body does.
 *
 * Everything here exchanges serialized JSON at its boundary. The server loads
 * this module through the `.pages-md` bundle (lib/server/pages-projection.ts),
 * which carries its own copy of ProseMirror: passing a `Node` or a `Step` built
 * by the application bundle into it would mix two runtimes whose `instanceof`
 * checks disagree.
 *
 * No `server-only`, no DOM: building the schema and applying steps read no
 * browser API, so the same functions run in the editor and in a function.
 */

import { getSchema, type JSONContent } from "@tiptap/core";
import { Fragment, Mark, Node as PMNode, Schema, Slice } from "@tiptap/pm/model";
import { ReplaceStep, Step, Transform } from "@tiptap/pm/transform";
import { pageExtensions } from "@/components/pages/page-extensions";
import { BLOCK_ID_ATTRIBUTE, BLOCK_ID_TYPES } from "@/components/pages/blocks";

export { COLLAB_META, COLLAB_REBUILD_META, isCollabRemoteTransaction } from "./page-collaboration-origin";

/* ── Schemas ──────────────────────────────────────────────────────────────── */

let bodySchema: Schema | null = null;

/** The page body schema — the editor's, minus its views. Built once. */
export function pageBodySchema(): Schema {
  bodySchema ??= getSchema(pageExtensions({ headless: true }));
  return bodySchema;
}

/**
 * The title as a document: text only, no marks, no blocks. Positions are UTF-16
 * offsets, exactly like `HTMLTextAreaElement.selectionStart`, because a
 * ProseMirror text position counts JavaScript string units.
 */
export const pageTitleSchema = new Schema({
  nodes: { doc: { content: "text*" }, text: {} },
  marks: {},
});

/** The same 500-character ceiling as every other title write (MIN-118). */
export const MAX_PAGE_TITLE_LENGTH = 500;

export function titleDocFromText(text: string): PMNode {
  return pageTitleSchema.node("doc", null, text ? [pageTitleSchema.text(text)] : []);
}

/* ── Canonical initialization ─────────────────────────────────────────────── */

function newBlockId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `b-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * The document every collaborator starts from, as stored JSON.
 *
 * `createPage()` stores `{ type: "doc", content: [] }`, but the Document node
 * requires `block+`. Left alone, each editor would fill the gap itself — an
 * empty paragraph with a RANDOM block ID — and two people opening the same new
 * page would start from two different revision-zero documents. The authority
 * commits this canonical form once, under its CAS, before publishing a head.
 *
 * The same pass stamps a block ID on every identified block that lacks one, and
 * replaces duplicated IDs, which is what `UniqueID` would otherwise do on each
 * client with different random values.
 */
export function canonicalBodyJSON(json: unknown): JSONContent {
  const schema = pageBodySchema();
  let doc: PMNode;
  try {
    doc = PMNode.fromJSON(schema, json && typeof json === "object" ? json : { type: "doc", content: [] });
  } catch {
    doc = schema.topNodeType.create();
  }
  if (doc.childCount === 0) {
    doc = schema.topNodeType.create(null, schema.nodes.paragraph.create());
  }
  try {
    doc.check();
  } catch {
    doc = schema.topNodeType.createAndFill(null, doc.content) ??
      schema.topNodeType.create(null, schema.nodes.paragraph.create());
  }

  const types = new Set(BLOCK_ID_TYPES);
  const seen = new Set<string>();
  const tr = new Transform(doc);
  doc.descendants((node, pos) => {
    if (!types.has(node.type.name)) return;
    const id = node.attrs[BLOCK_ID_ATTRIBUTE];
    if (typeof id === "string" && id && !seen.has(id)) {
      seen.add(id);
      return;
    }
    const next = newBlockId();
    seen.add(next);
    tr.setNodeAttribute(pos, BLOCK_ID_ATTRIBUTE, next);
  });
  return tr.doc.toJSON() as JSONContent;
}

/** Whether stored JSON is already the canonical document (no initialization due). */
export function isCanonicalBodyJSON(json: unknown): boolean {
  const schema = pageBodySchema();
  try {
    const stored = PMNode.fromJSON(schema, json);
    if (stored.childCount === 0) return false;
    stored.check();
    const canonical = PMNode.fromJSON(schema, canonicalBodyJSON(json));
    return canonical.eq(stored);
  } catch {
    return false;
  }
}

/* ── Applying steps ───────────────────────────────────────────────────────── */

export type CollabField = "body" | "title";

export type ApplyStepsResult =
  | { ok: true; doc: JSONContent; text: string }
  | { ok: false; reason: "invalid-step" | "step-failed" | "invalid-document" | "title-too-long" };

function schemaOf(field: CollabField): Schema {
  return field === "body" ? pageBodySchema() : pageTitleSchema;
}

function docOf(field: CollabField, value: unknown): PMNode {
  return field === "body"
    ? PMNode.fromJSON(pageBodySchema(), value)
    : titleDocFromText(typeof value === "string" ? value : "");
}

/**
 * Applies accepted-candidate steps to the stream's current value.
 *
 * `current` is the stored body JSON, or the title string. Every step must
 * deserialize against the schema and apply cleanly, and the result must pass
 * ProseMirror's structural check — `Node.fromJSON` alone accepts content that
 * violates content expressions.
 */
export function applyCollabSteps(
  field: CollabField,
  current: unknown,
  steps: readonly unknown[]
): ApplyStepsResult {
  const schema = schemaOf(field);
  let doc: PMNode;
  try {
    doc = docOf(field, current);
  } catch {
    return { ok: false, reason: "invalid-document" };
  }
  for (const json of steps) {
    let step: Step;
    try {
      step = Step.fromJSON(schema, json as Parameters<typeof Step.fromJSON>[1]);
    } catch {
      return { ok: false, reason: "invalid-step" };
    }
    const result = step.apply(doc);
    if (result.failed || !result.doc) return { ok: false, reason: "step-failed" };
    doc = result.doc;
  }
  try {
    doc.check();
  } catch {
    return { ok: false, reason: "invalid-document" };
  }
  if (field === "body" && doc.childCount === 0) return { ok: false, reason: "invalid-document" };
  const text = doc.textContent;
  if (field === "title" && text.length > MAX_PAGE_TITLE_LENGTH) {
    return { ok: false, reason: "title-too-long" };
  }
  return { ok: true, doc: doc.toJSON() as JSONContent, text };
}

/* ── Expressing a whole replacement as steps ──────────────────────────────── */

/** Above this many comparisons, an alignment falls back to one replaced range. */
const LCS_CELL_LIMIT = 1_000_000;

/** Index pairs of a longest common subsequence, or `null` when too large to compute. */
function lcsPairs<T>(
  a: readonly T[],
  b: readonly T[],
  same: (x: T, y: T) => boolean
): Array<[number, number]> | null {
  if (a.length * b.length > LCS_CELL_LIMIT) return null;
  const table = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i][j] = same(a[i], b[j])
        ? table[i + 1][j + 1] + 1
        : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (same(a[i], b[j])) {
      pairs.push([i, j]);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return pairs;
}

/** Runs between matched pairs: `[aStart, aEnd, bStart, bEnd]`, in order. */
function gapsBetween(
  pairs: ReadonlyArray<[number, number]>,
  aLength: number,
  bLength: number
): Array<[number, number, number, number]> {
  const gaps: Array<[number, number, number, number]> = [];
  let ai = 0;
  let bi = 0;
  for (const [pa, pb] of [...pairs, [aLength, bLength] as [number, number]]) {
    if (pa > ai || pb > bi) gaps.push([ai, pa, bi, pb]);
    ai = pa + 1;
    bi = pb + 1;
  }
  return gaps;
}

/** One edit, located in the ORIGINAL document, applied last-to-first. */
type Edit =
  | { at: number; kind: "replace"; to: number; content: Fragment }
  | { at: number; kind: "into"; from: PMNode; target: PMNode };

/**
 * Inline content as units a person edits: words, runs of spaces, single
 * punctuation marks (each with its marks), and inline nodes. Word-sized units
 * keep a rewritten sentence a handful of natural edits instead of a scatter of
 * matched letters.
 */
interface InlineUnit {
  text: string | null;
  node: PMNode;
  size: number;
}

const TOKEN = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;

function inlineUnits(parent: PMNode): InlineUnit[] {
  const units: InlineUnit[] = [];
  parent.forEach((child) => {
    if (!child.isText) {
      units.push({ text: null, node: child, size: child.nodeSize });
      return;
    }
    for (const token of child.text!.match(TOKEN) ?? []) {
      units.push({ text: token, node: child, size: token.length });
    }
  });
  return units;
}

function sameUnit(a: InlineUnit, b: InlineUnit): boolean {
  if (a.text !== null || b.text !== null) {
    return a.text === b.text && Mark.sameSet(a.node.marks, b.node.marks);
  }
  return a.node.eq(b.node);
}

function unitsFragment(schema: Schema, units: readonly InlineUnit[]): Fragment {
  const nodes: PMNode[] = [];
  let text = "";
  let marks: readonly Mark[] | null = null;
  const flush = () => {
    if (text) nodes.push(schema.text(text, marks ?? undefined));
    text = "";
    marks = null;
  };
  for (const unit of units) {
    if (unit.text === null) {
      flush();
      nodes.push(unit.node);
    } else if (marks && Mark.sameSet(marks, unit.node.marks)) {
      text += unit.text;
    } else {
      flush();
      text = unit.text;
      marks = unit.node.marks;
    }
  }
  flush();
  return Fragment.fromArray(nodes);
}

/** Edits turning one inline content into another, by word-sized units. */
function inlineEdits(from: PMNode, to: PMNode, start: number, edits: Edit[]): void {
  const a = inlineUnits(from);
  const b = inlineUnits(to);
  const offsets = [0];
  for (const unit of a) offsets.push(offsets[offsets.length - 1] + unit.size);
  const pairs = lcsPairs(a, b, sameUnit) ?? [];
  for (const [aStart, aEnd, bStart, bEnd] of gapsBetween(pairs, a.length, b.length)) {
    edits.push({
      at: start + offsets[aStart],
      kind: "replace",
      to: start + offsets[aEnd],
      content: unitsFragment(to.type.schema, b.slice(bStart, bEnd)),
    });
  }
}

/**
 * Edits turning the content of `from` into that of `to`, where `start` is the
 * position of `from`'s content in the original document. Unchanged children
 * are matched exactly; among the rest, children of the same type and
 * attributes are edited in place (recursively, down to words in a text
 * block), and only what has no counterpart is inserted or removed.
 */
function contentEdits(from: PMNode, to: PMNode, start: number, edits: Edit[]): void {
  if (from.inlineContent && to.inlineContent) {
    inlineEdits(from, to, start, edits);
    return;
  }
  const a: PMNode[] = [];
  const b: PMNode[] = [];
  from.forEach((child) => a.push(child));
  to.forEach((child) => b.push(child));
  const offsets = [0];
  for (const child of a) offsets.push(offsets[offsets.length - 1] + child.nodeSize);
  const exact = lcsPairs(a, b, (x, y) => x.eq(y));
  if (!exact) {
    edits.push({ at: start, kind: "replace", to: start + from.content.size, content: to.content });
    return;
  }
  for (const [aStart, aEnd, bStart, bEnd] of gapsBetween(exact, a.length, b.length)) {
    const oldRun = a.slice(aStart, aEnd);
    const newRun = b.slice(bStart, bEnd);
    const shaped = lcsPairs(oldRun, newRun, (x, y) => !x.isLeaf && x.sameMarkup(y)) ?? [];
    for (const [x, y] of shaped) {
      edits.push({ at: start + offsets[aStart + x], kind: "into", from: oldRun[x], target: newRun[y] });
    }
    for (const [xs, xe, ys, ye] of gapsBetween(shaped, oldRun.length, newRun.length)) {
      edits.push({
        at: start + offsets[aStart + xs],
        kind: "replace",
        to: start + offsets[aStart + xe],
        content: Fragment.fromArray(newRun.slice(ys, ye)),
      });
    }
  }
}

/** The same edits, flattened: a node edited in place contributes its own. */
function flatEdits(from: PMNode, to: PMNode): Array<Extract<Edit, { kind: "replace" }>> {
  const pending: Edit[] = [];
  contentEdits(from, to, 0, pending);
  const flat: Array<Extract<Edit, { kind: "replace" }>> = [];
  while (pending.length > 0) {
    const edit = pending.pop()!;
    if (edit.kind === "replace") flat.push(edit);
    else contentEdits(edit.from, edit.target, edit.at + 1, pending);
  }
  return flat;
}

/**
 * The previous strategy, kept as the fallback: one replaced range between the
 * first and the last difference.
 */
function rangeDiffSteps(from: PMNode, to: PMNode): Step[] {
  const start = from.content.findDiffStart(to.content);
  if (start == null) return [];
  const end = from.content.findDiffEnd(to.content);
  let endA = end?.a ?? from.content.size;
  let endB = end?.b ?? to.content.size;
  const overlap = start - Math.min(endA, endB);
  if (overlap > 0) {
    endA += overlap;
    endB += overlap;
  }
  try {
    const tr = new Transform(from);
    tr.replace(start, endA, to.slice(start, endB));
    if (tr.doc.eq(to)) return tr.steps;
  } catch {
    // Fitting failed (inconsistent open depths); fall through.
  }
  return [new ReplaceStep(0, from.content.size, new Slice(to.content, 0, 0))];
}

/**
 * The steps that turn one document into another, as a person would make them.
 *
 * This is how a writer that only knows whole documents — a Numo or MCP edit,
 * a restored version, the subpage mirror, an older browser tab — joins the
 * live stream. Unchanged blocks are left alone; a changed block of the same
 * kind is edited in place, word by word, recursively through lists, quotes
 * and toggles; only blocks without a counterpart are inserted or removed. Two
 * separate corrections are therefore two small steps, and text a collaborator
 * typed between them is never part of either.
 *
 * The edits are applied from the end of the document backwards, so every
 * position still refers to the original document. The result is verified;
 * when it does not reproduce `to` exactly, the single-range replacement is
 * used instead.
 */
export function diffDocSteps(from: PMNode, to: PMNode): Step[] {
  if (from.eq(to)) return [];
  try {
    const tr = new Transform(from);
    const edits = flatEdits(from, to).sort((x, y) => y.at - x.at || y.to - x.to);
    for (const edit of edits) {
      const result = tr.maybeStep(new ReplaceStep(edit.at, edit.to, new Slice(edit.content, 0, 0)));
      if (result.failed) throw new Error(result.failed);
    }
    if (tr.doc.eq(to)) return tr.steps;
  } catch {
    // An intermediate state the schema refuses; fall back below.
  }
  return rangeDiffSteps(from, to);
}

/* ── Rebasing a writer's steps onto newer accepted steps ───────────────────── */

/**
 * `ours`, written against `base`, moved past `over` — steps accepted on the
 * same base in the meantime. This is what a browser session does when its
 * batch arrives late (`prosemirror-collab`'s `rebaseSteps`, which that package
 * does not expose, and which this follows): undo ours, apply theirs, then map
 * each of ours through everything that happened since it was written. A step
 * whose target was removed meanwhile is dropped, exactly like a person's.
 */
export function rebaseDocSteps(base: PMNode, ours: readonly Step[], over: readonly Step[]): Step[] {
  let doc = base;
  const inverted: Step[] = [];
  for (const step of ours) {
    inverted.push(step.invert(doc));
    const result = step.apply(doc);
    if (result.failed || !result.doc) return [];
    doc = result.doc;
  }
  const tr = new Transform(doc);
  for (let i = inverted.length - 1; i >= 0; i -= 1) tr.step(inverted[i]);
  for (const step of over) tr.step(step);
  const rebased: Step[] = [];
  for (let i = 0, mapFrom = ours.length; i < ours.length; i += 1) {
    const mapped = ours[i].map(tr.mapping.slice(mapFrom));
    mapFrom -= 1;
    if (mapped && !tr.maybeStep(mapped).failed) {
      // Internal in ProseMirror's typings, public at runtime: it pairs the undone
      // step with its re-application so later maps cancel them out.
      (tr.mapping as unknown as { setMirror(from: number, to: number): void })
        .setMirror(mapFrom, tr.steps.length - 1);
      rebased.push(mapped);
    }
  }
  return rebased;
}

/** `rebaseDocSteps` across the JSON boundary, for the server bundle. */
export function rebaseCollabSteps(
  field: CollabField,
  base: unknown,
  ours: readonly unknown[],
  over: readonly unknown[]
): unknown[] {
  const schema = schemaOf(field);
  const parse = (json: unknown) => Step.fromJSON(schema, json as Parameters<typeof Step.fromJSON>[1]);
  return rebaseDocSteps(docOf(field, base), ours.map(parse), over.map(parse))
    .map((step) => step.toJSON());
}

/** `diffDocSteps` across the JSON boundary, for the server bundle. */
export function diffCollabSteps(
  field: CollabField,
  from: unknown,
  to: unknown
): unknown[] {
  return diffDocSteps(docOf(field, from), docOf(field, to)).map((step) => step.toJSON());
}

/** Structural equality of two stored values of a stream. */
export function sameCollabValue(field: CollabField, a: unknown, b: unknown): boolean {
  try {
    return docOf(field, a).eq(docOf(field, b));
  } catch {
    return false;
  }
}
