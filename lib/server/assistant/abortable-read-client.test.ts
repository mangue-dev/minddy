import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { abortableReadClient } from "./abortable-read-client";

describe("scoped Supabase read cancellation", () => {
  it("aborts the real query transport without changing requests on the shared client", async () => {
    const controller = new AbortController();
    const signals: Array<AbortSignal | undefined> = [];
    let finishShared!: () => void;
    const fetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const signal = init?.signal ?? undefined;
      signals.push(signal);
      return new Promise<Response>((resolve, reject) => {
        if (signal) signal.addEventListener("abort", () => reject(new DOMException("Canceled", "AbortError")));
        else finishShared = () => resolve(new Response("[]", { status: 200 }));
      });
    });
    const client = createClient("https://example.supabase.co", "test-key", {
      global: { fetch }, auth: { persistSession: false, autoRefreshToken: false },
    });
    const scoped = abortableReadClient(client, controller.signal);
    const canceled = Promise.resolve(scoped.from("projects").select("id").eq("owner_id", "user").maybeSingle());
    const shared = Promise.resolve(client.from("projects").select("id"));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(signals).toEqual([controller.signal, undefined]);
    controller.abort();
    expect((await canceled).error?.message).toContain("AbortError");
    finishShared();
    expect((await shared).error).toBeNull();
  });
});
