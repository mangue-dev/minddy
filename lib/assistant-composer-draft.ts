/** Serialize editor tokens without their portal-rendered visual children. */
export function assistantDraftHtml(editor: HTMLElement): string {
  const clone = editor.cloneNode(true) as HTMLElement;
  for (const token of clone.querySelectorAll<HTMLElement>(
    "[data-mention-id], [data-skill-path]",
  )) {
    token.replaceChildren();
  }
  return clone.innerHTML;
}
