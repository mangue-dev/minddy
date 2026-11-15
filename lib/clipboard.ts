/**
 * Writes `text` to the clipboard and resolves whether it worked.
 *
 * The Async Clipboard API rejects when the page lacks focus, when an embedded
 * browser denies the permission, or when the API is missing (insecure
 * context). Every copy control must tell the user about that failure instead of
 * confirming a copy that never happened, so this helper never throws: callers
 * branch on the boolean and show "Copied" or "Copy failed".
 */
export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
