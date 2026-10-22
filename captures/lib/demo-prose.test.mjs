import { test } from "node:test";
import assert from "node:assert/strict";
import { demoProse, translateDemo } from "./demo-prose.mjs";

const prose = demoProse({
  "Ship the release": "Lançar a versão",
  "Add a layer to the palette, so people\nstop needing the mouse.\n\n## Approach\n\n- [x] Declare shortcuts\n- [ ] Bind **the** listener":
    "Adicionar uma camada à paleta para dispensar o mouse.\n\n## Abordagem\n\n- [x] Declarar atalhos\n- [ ] Vincular o listener",
});

test("translates exact strings and ignores surrounding whitespace", () => {
  assert.equal(translateDemo("Ship the release", prose), "Lançar a versão");
  assert.equal(translateDemo("Ship the release\n", prose), "Lançar a versão");
  assert.equal(translateDemo("Unknown text", prose), "Unknown text");
});

test("translates editor blocks paired from hard-wrapped Markdown", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "paragraph", attrs: { blockId: "a" }, content: [{ type: "text", text: "Add a layer to the palette, so people stop needing the mouse." }] },
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Approach" }] },
      { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ type: "text", text: "Bind " }, { type: "text", text: "the", marks: [{ type: "bold" }] }, { type: "text", text: " listener" }] }] },
    ],
  };
  const [paragraph, heading, task] = translateDemo(doc, prose).content;
  assert.deepEqual(paragraph, { type: "paragraph", attrs: { blockId: "a" }, content: [{ type: "text", text: "Adicionar uma camada à paleta para dispensar o mouse." }] });
  assert.equal(heading.content[0].text, "Abordagem");
  assert.deepEqual(task.content[0].content, [{ type: "text", text: "Vincular o listener" }]);
  assert.equal(task.attrs.checked, false);
});
