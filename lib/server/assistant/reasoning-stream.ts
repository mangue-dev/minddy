import "server-only";

import {
  appendAssistantReasoning,
  type AssistantReasoning,
} from "@/lib/assistant-reasoning";
import type { SafeEmitter } from "./sse";

const REASONING_TICK_MS = 250;

/**
 * Turn model reasoning deltas into the same compact live signal used by the
 * code agent. Each delta is forwarded as a `reasoning_delta` snapshot of the
 * trace accumulated so far — the browser streams the thinking live under the
 * reflective row while it runs, and the full trace is re-broadcast once by
 * `reasoning_end` for the durable replay.
 */
export class AssistantReasoningStream {
  private startedAt: number | null = null;
  private text = "";
  private timer: ReturnType<typeof setInterval> | null = null;
  private completed: AssistantReasoning | null | undefined;

  constructor(
    private readonly emitter: SafeEmitter,
    private readonly now: () => number = Date.now,
  ) {}

  push(delta: string): void {
    if (!delta || this.completed !== undefined) return;
    if (this.startedAt === null) {
      this.startedAt = this.now();
      this.emitter.emit("reasoning_start", {
        started_at: new Date(this.startedAt).toISOString(),
      });
      this.timer = setInterval(() => {
        this.emitter.emit("reasoning_tick", {
          duration_ms: this.durationMs(),
        });
      }, REASONING_TICK_MS);
    }

    this.text = appendAssistantReasoning(this.text, delta);
    // A snapshot, not an increment: a subscriber joining mid-stream replaces
    // its text instead of replaying missed chunks, and `reasoning_end` stays
    // the single authority over the final trace.
    this.emitter.emit("reasoning_delta", { text: this.text });
  }

  finish(): AssistantReasoning | null {
    if (this.completed !== undefined) return this.completed;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;

    if (this.startedAt === null || !this.text.trim()) {
      this.completed = null;
      return null;
    }

    this.completed = {
      text: this.text,
      durationMs: this.durationMs(),
    };
    this.emitter.emit("reasoning_end", {
      duration_ms: this.completed.durationMs,
      text: this.completed.text,
    });
    return this.completed;
  }

  private durationMs(): number {
    return this.startedAt === null ? 0 : Math.max(0, this.now() - this.startedAt);
  }
}
