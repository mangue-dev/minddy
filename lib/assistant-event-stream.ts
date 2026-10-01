/** Decode SSE independently of the HTTP transport's arbitrary byte boundaries. */
export function createAssistantEventStream(
  onEvent: (type: string, data: Record<string, unknown>) => void,
) {
  const decoder = new TextDecoder();
  let buffer = "";
  let eventType = "";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (eventType && dataLines.length) {
      try {
        const data: unknown = JSON.parse(dataLines.join("\n"));
        if (data && typeof data === "object" && !Array.isArray(data)) {
          onEvent(eventType, data as Record<string, unknown>);
        }
      } catch {
        // An invalid event must not hide the next valid event.
      }
    }
    eventType = "";
    dataLines = [];
  };

  const parse = () => {
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
      if (!line) dispatch();
      else if (line.startsWith("event:")) eventType = line.slice(6).trimStart();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
      newline = buffer.indexOf("\n");
    }
  };

  return {
    push(chunk: Uint8Array) {
      buffer += decoder.decode(chunk, { stream: true });
      parse();
    },
    finish() {
      buffer += decoder.decode();
      parse();
    },
  };
}
