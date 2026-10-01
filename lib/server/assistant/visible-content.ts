/** Hide serialized tool protocol emitted as text, including split opening tags. */
export function visibleAssistantContent(content: string): string {
  const visible = content.replace(/<tool_call\b[^>]*>[\s\S]*?(?:<\/tool_call\s*>|$)/gi, "");
  const opening = "<tool_call";
  for (let size = opening.length; size > 0; size--) {
    if (visible.toLowerCase().endsWith(opening.slice(0, size))) {
      return visible.slice(0, -size);
    }
  }
  return visible;
}
