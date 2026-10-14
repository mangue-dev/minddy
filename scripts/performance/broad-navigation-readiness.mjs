/** Complete accepted fixture content, independent of a panel's first shell paint. */
export function broadIssueReady(spec) {
  const visible = (node) => !!node.getClientRects().length &&
    getComputedStyle(node).visibility !== "hidden" && !node.closest('[inert], [aria-hidden="true"]');
  const normalize = (value) => String(value).replace(/\s+/g, " ").trim();
  const panel = [...document.querySelectorAll('[role="dialog"]')].find((node) => visible(node) &&
    [...node.querySelectorAll('textarea')].some((title) => visible(title) && !title.disabled && !title.readOnly && title.value.trim() === spec.title));
  if (!panel) return false;
  const editors = [...panel.querySelectorAll('.tiptap[contenteditable="true"]')].filter(visible);
  if (!editors.some((node) => normalize(node.innerText ?? node.textContent) === normalize(spec.description))) return false;
  if (![...panel.querySelectorAll('[role="textbox"][contenteditable="true"][aria-placeholder]')].some(visible)) return false;
  const timeline = [...panel.querySelectorAll('[data-query-read-phase="fresh"]')].find(visible);
  if (!timeline) return false;
  const comments = [...timeline.querySelectorAll('[data-comment-id]')].filter(visible);
  return comments.length === spec.comments.length && spec.comments.every((expected) => comments.some((node) =>
    node.dataset.commentId === expected.id && node.dataset.commentState === "confirmed" &&
    normalize(node.innerText ?? node.textContent).includes(normalize(expected.body))));
}

/** Match each original block, the exact title and a writable mounted document. */
export function broadPageReady(spec) {
  const visible = (node) => !!node.getClientRects().length &&
    getComputedStyle(node).visibility !== "hidden" && !node.closest('[inert], [aria-hidden="true"]');
  const normalize = (value) => String(value).replace(/\s+/g, " ").trim();
  if (location.pathname !== spec.href || !document.querySelector(`[data-app-tab-id="${spec.tab}"][aria-selected="true"]`)) return false;
  const surface = document.querySelector(`[data-page-surface-id="${spec.pageId}"]`);
  if (!surface || !visible(surface)) return false;
  const title = [...surface.querySelectorAll('h1, textarea')].some((node) => visible(node) &&
    !node.disabled && !node.readOnly && (node.value ?? node.textContent).trim() === spec.title);
  if (!title) return false;
  return [...surface.querySelectorAll('.page-editor .tiptap[contenteditable="true"]')].some((editor) => visible(editor) &&
    editor.children.length === spec.blocks.length && spec.blocks.every((block, index) => {
      const node = editor.children[index];
      return node.tagName.toLowerCase() === block.tag && normalize(node.innerText ?? node.textContent) === normalize(block.text);
    }));
}

/** Keep source bodies in the browser gate, never in public result metadata. */
export function broadPageSpec(body, href, tab) {
  if (body.content?.type !== "doc" || !Array.isArray(body.content.content)) throw new Error("A complete fixture document is required");
  const text = (node) => node.text ?? (node.content ?? []).map(text).join("");
  const blocks = body.content.content.map((block) => {
    if (!["heading", "paragraph"].includes(block.type)) throw new Error("Unexpected fixture block type");
    return { tag: block.type === "heading" ? `h${block.attrs?.level}` : "p", text: text(block) };
  });
  return { href, tab, pageId: body.id, title: body.title, blocks };
}
