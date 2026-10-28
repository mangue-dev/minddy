import { Schema, type Node as PMNode } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { getMatchHighlights, search } from "prosemirror-search";
import { describe, expect, it } from "vitest";
import {
  currentMatchIndex,
  escapeRegExp,
  findMatches,
  findQuery,
  isInvalidPattern,
  replaceAllMatches,
  replaceCurrentMatch,
  selectMatch,
  setSearchState,
  stepMatch,
  type FindOptions,
} from "./find-replace";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    text: { group: "inline" },
  },
  marks: { strong: {} },
});

function stateOf(...paragraphs: string[]): EditorState {
  const doc = schema.node(
    "doc",
    null,
    paragraphs.map((text) => schema.node("paragraph", null, text ? [schema.text(text)] : [])),
  );
  return EditorState.create({ doc, plugins: [search()] });
}

const texts = (doc: PMNode) => {
  const out: string[] = [];
  doc.forEach((block) => out.push(block.textContent));
  return out;
};

function options(patch: Partial<FindOptions>): FindOptions {
  return { search: "", replace: "", caseSensitive: false, wholeWord: false, regexp: false, ...patch };
}

const matchedText = (state: EditorState, query: ReturnType<typeof findQuery>) =>
  findMatches(state, query).map((match) => state.doc.textBetween(match.from, match.to));

describe("find", () => {
  it("ignores case unless asked, across blocks", () => {
    const state = stateOf("Hello hello", "HELLO there");
    expect(findMatches(state, findQuery(options({ search: "hello" })))).toHaveLength(3);
    expect(matchedText(state, findQuery(options({ search: "Hello", caseSensitive: true })))).toEqual(["Hello"]);
  });

  it("keeps whole words only when asked", () => {
    const state = stateOf("cat concat cat. cats");
    expect(findMatches(state, findQuery(options({ search: "cat" })))).toHaveLength(4);
    expect(findMatches(state, findQuery(options({ search: "cat", wholeWord: true })))).toHaveLength(2);
  });

  it("reads a plain search literally", () => {
    const state = stateOf("a.b axb a\\nb");
    expect(matchedText(state, findQuery(options({ search: "a.b" })))).toEqual(["a.b"]);
    expect(matchedText(state, findQuery(options({ search: "a\\nb" })))).toEqual(["a\\nb"]);
  });

  it("matches regular expressions, and skips their empty matches", () => {
    const state = stateOf("v1.2 and v10.0");
    expect(matchedText(state, findQuery(options({ search: "v\\d+\\.\\d", regexp: true })))).toEqual(["v1.2", "v10.0"]);
    expect(findMatches(state, findQuery(options({ search: "x*", regexp: true })))).toEqual([]);
  });

  it("flags an invalid expression and highlights nothing", () => {
    const state = stateOf("a (b) c");
    const invalid = options({ search: "(b", regexp: true });
    expect(isInvalidPattern(invalid)).toBe(true);
    expect(findMatches(state, findQuery(invalid))).toEqual([]);
    const highlighted = state.apply(setSearchState(state.tr, findQuery(invalid)));
    expect(getMatchHighlights(highlighted).find()).toEqual([]);
    // The same text is a valid plain search.
    expect(isInvalidPattern({ search: "(b", regexp: false })).toBe(false);
    expect(findMatches(state, findQuery(options({ search: "(b" })))).toHaveLength(1);
  });

  it("escapes a seeded selection for an expression search", () => {
    const state = stateOf("cost (USD) $5");
    expect(matchedText(state, findQuery(options({ search: escapeRegExp("(USD) $5"), regexp: true })))).toEqual(["(USD) $5"]);
  });

  it("highlights every match and emphasizes the selected one", () => {
    let state = stateOf("one two one");
    const query = findQuery(options({ search: "one" }));
    state = state.apply(setSearchState(state.tr, query));
    const [first] = findMatches(state, query);
    state = state.apply(selectMatch(state, first));
    // An inline decoration keeps its attributes on its (untyped) `type`.
    const classes = getMatchHighlights(state).find()
      .map((deco) => (deco as unknown as { type: { attrs: { class: string } } }).type.attrs.class);
    expect(classes).toEqual(["ProseMirror-active-search-match", "ProseMirror-search-match"]);
  });

  it("steps forward and back from the selection, wrapping around", () => {
    let state = stateOf("x a x b x");
    const matches = findMatches(state, findQuery(options({ search: "x" })));
    expect(currentMatchIndex(state, matches)).toBe(-1);
    state = state.apply(selectMatch(state, matches[2]));
    expect(currentMatchIndex(state, matches)).toBe(2);
    expect(stepMatch(state, matches, 1)).toBe(matches[0]);
    expect(stepMatch(state, matches, -1)).toBe(matches[1]);
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1)));
    expect(stepMatch(state, matches, -1)).toBe(matches[2]);
  });
});

describe("replace", () => {
  it("replaces every match in one transaction and counts them", () => {
    const state = stateOf("a-b-c", "d-e");
    const result = replaceAllMatches(state, findQuery(options({ search: "-", replace: "+" })));
    expect(result?.count).toBe(3);
    expect(texts(result!.tr.doc)).toEqual(["a+b+c", "d+e"]);
    expect(result!.tr.steps.length).toBeGreaterThan(0);
    expect(replaceAllMatches(state, findQuery(options({ search: "?" })))).toBeNull();
  });

  it("substitutes regular-expression groups", () => {
    const state = stateOf("John Smith", "Ada Lovelace");
    const query = findQuery(options({ search: "(\\w+) (\\w+)", replace: "$2, $1", regexp: true }));
    expect(texts(replaceAllMatches(state, query)!.tr.doc)).toEqual(["Smith, John", "Lovelace, Ada"]);
    const whole = findQuery(options({ search: "\\d+", replace: "[$&]", regexp: true }));
    expect(texts(replaceAllMatches(stateOf("a 12 b 3"), whole)!.tr.doc)).toEqual(["a [12] b [3]"]);
  });

  it("inserts a plain replacement as typed, dollar signs included", () => {
    const state = stateOf("price: X");
    const query = findQuery(options({ search: "X", replace: "$1 or $&" }));
    expect(texts(replaceAllMatches(state, query)!.tr.doc)).toEqual(["price: $1 or $&"]);
  });

  it("honors case and whole word when replacing", () => {
    const state = stateOf("Cat cat concat");
    const query = findQuery(options({ search: "cat", replace: "dog", caseSensitive: true, wholeWord: true }));
    const result = replaceAllMatches(state, query)!;
    expect(result.count).toBe(1);
    expect(texts(result.tr.doc)).toEqual(["Cat dog concat"]);
  });

  it("selects the next match first, then replaces it and moves on", () => {
    let state = stateOf("foo bar foo");
    const query = findQuery(options({ search: "foo", replace: "baz" }));
    // Nothing selected: the first Replace only selects.
    let tr = replaceCurrentMatch(state, query)!;
    expect(tr.docChanged).toBe(false);
    state = state.apply(tr);
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe("foo");

    tr = replaceCurrentMatch(state, query)!;
    state = state.apply(tr);
    expect(texts(state.doc)).toEqual(["baz bar foo"]);
    // The selection moved to the remaining match.
    expect(state.selection.from).toBe(9);
    expect(state.doc.textBetween(state.selection.from, state.selection.to)).toBe("foo");

    state = state.apply(replaceCurrentMatch(state, query)!);
    expect(texts(state.doc)).toEqual(["baz bar baz"]);
    expect(replaceCurrentMatch(state, query)).toBeNull();
  });
});
