import "server-only";

// ── SSE helpers (ported from AutoKap's assistant) ──────────────────────

export function sseEncode(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Safe emitter that continues processing even if the client disconnects. */
export interface SafeEmitter {
  emit(event: string, data: unknown): void;
  /**
   * Records an event for readers that follow the turn's journal, without
   * sending it on the live stream. Only a durable turn's emitter has one.
   */
  journal?(event: string, data: unknown): void;
  close(): void;
  readonly isClosed: boolean;
}

export function createSafeEmitter(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder
): SafeEmitter {
  let closed = false;
  return {
    emit(event: string, data: unknown) {
      if (closed) return;
      try {
        controller.enqueue(encoder.encode(sseEncode(event, data)));
      } catch {
        closed = true;
      }
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
    get isClosed() {
      return closed;
    },
  };
}
