/** Delete one non-editable composer token immediately before a collapsed caret. */
export function deleteComposerTokenBeforeCaret(
  editor: HTMLElement,
  selection: Selection | null,
  selector: string,
): boolean {
  if (!selection?.isCollapsed) return false;
  const anchor = selection.anchorNode;
  if (!anchor || !editor.contains(anchor)) return false;

  let token: HTMLElement | null = null;
  let caretNode: Node = anchor;
  let caretOffset = selection.anchorOffset;

  if (anchor.nodeType === Node.TEXT_NODE) {
    const text = anchor as Text;
    if (caretOffset > 0) {
      const separator = text.data[caretOffset - 1];
      const previous = text.previousSibling;
      if (
        !/[ \u00a0]/.test(separator ?? "") ||
        !(previous instanceof HTMLElement) ||
        !previous.matches(selector)
      ) {
        return false;
      }
      token = previous;
      text.deleteData(caretOffset - 1, 1);
      caretOffset -= 1;
    } else {
      const previous = text.previousSibling;
      if (!(previous instanceof HTMLElement) || !previous.matches(selector)) {
        return false;
      }
      token = previous;
    }
  } else if (anchor === editor) {
    let index = caretOffset - 1;
    let previous = editor.childNodes[index];
    let separator: Node | null = null;
    if (
      previous?.nodeType === Node.TEXT_NODE &&
      /^[ \u00a0]$/.test(previous.textContent ?? "")
    ) {
      separator = previous;
      index -= 1;
      previous = editor.childNodes[index];
    }
    if (!(previous instanceof HTMLElement) || !previous.matches(selector)) {
      return false;
    }
    token = previous;
    if (separator) editor.removeChild(separator);
    caretNode = editor;
    caretOffset = index;
  } else {
    return false;
  }

  token.remove();
  const range = document.createRange();
  range.setStart(caretNode, caretOffset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}
