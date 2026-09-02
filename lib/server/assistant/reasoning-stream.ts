import "server-only";

import {
  appendAssistantReasoning,
  type AssistantReasoning,
} from "@/lib/assistant-reasoning";
import type { SafeEmitter } from "./sse";

const REASONING_TICK_MS = 250;

/**
 * Turn model reasoning deltas into the same compact live signal used by the
 * code agent. The trace itself is accumulated for the completed, collapsible
 * row; while reasoning is active, the browser only renders the label and the
 * server-measured counter.
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
