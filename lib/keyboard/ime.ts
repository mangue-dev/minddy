/**
 * Is this key part of an IME composition (Chinese, Japanese, Korean input)?
 *
 * During a composition, Enter commits the candidate and the arrows move
 * between candidates: a field shortcut must leave them to the input method.
 * Safari reports the committing Enter after `compositionend`, with
 * `isComposing` already false but the legacy `keyCode` 229 the browser uses for
 * every key an IME handles.
 */
export function isImeComposing(event: { nativeEvent: { isComposing?: boolean; keyCode?: number } }): boolean {
  return event.nativeEvent.isComposing === true || event.nativeEvent.keyCode === 229;
}
