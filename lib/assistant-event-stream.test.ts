import { describe, expect, it, vi } from "vitest";
import { createAssistantEventStream } from "./assistant-event-stream";

describe("assistant SSE transport", () => {
  it("preserves events and UTF-8 text across every byte boundary", () => {
    const onEvent = vi.fn();
    const stream = createAssistantEventStream(onEvent);
    const bytes = new TextEncoder().encode(
      'event: content_delta\r\ndata: {"delta":"Héllo"}\r\n\r\n'
      + 'event: done\ndata: {"status":"completed"}\n\n',
    );
    for (const byte of bytes) stream.push(new Uint8Array([byte]));
    stream.finish();
    expect(onEvent.mock.calls).toEqual([
      ["content_delta", { delta: "Héllo" }],
      ["done", { status: "completed" }],
    ]);
  });

  it("delivers text before completion when event and data arrive separately", () => {
    const onEvent = vi.fn();
    const stream = createAssistantEventStream(onEvent);
    const encode = (text: string) => new TextEncoder().encode(text);
    stream.push(encode("event: content_delta\n"));
    expect(onEvent).not.toHaveBeenCalled();
    stream.push(encode('data: {"delta":"first token"}\n\n'));
    expect(onEvent).toHaveBeenCalledWith("content_delta", { delta: "first token" });
  });

  it("keeps the next event after malformed data and accepts multiline data", () => {
    const onEvent = vi.fn();
    const stream = createAssistantEventStream(onEvent);
    stream.push(new TextEncoder().encode(
      'event: content_delta\ndata: broken\n\n'
      + ': keepalive\nevent: done\ndata: {\ndata: "status":"completed"}\n\n',
    ));
    expect(onEvent.mock.calls).toEqual([["done", { status: "completed" }]]);
  });
});
