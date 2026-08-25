import { describe, expect, it, vi } from "vitest";

import { readBoundedRequestBody } from "./request-body";

describe("readBoundedRequestBody", () => {
  it("rejects a declared oversized body before reading its stream", async () => {
    const body = vi.fn(() => {
      throw new Error("body stream was accessed");
    });
    const request = {
      headers: new Headers({ "content-length": "9" }),
      get body() {
        return body();
      },
    } as unknown as Request;

    await expect(readBoundedRequestBody(request, 8)).resolves.toEqual({
      ok: false,
      error: "too_large",
    });
    expect(body).not.toHaveBeenCalled();
  });

  it("cancels a chunked body as soon as it crosses the byte ceiling", async () => {
    let cancelled = false;
    const request = new Request("https://cloud.example.com/api/relay/test", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("1234"));
          controller.enqueue(new TextEncoder().encode("56789"));
        },
        cancel() {
          cancelled = true;
        },
      }),
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    await expect(readBoundedRequestBody(request, 8)).resolves.toEqual({
      ok: false,
      error: "too_large",
    });
    expect(cancelled).toBe(true);
  });

  it("decodes a bounded multi-byte body after counting wire bytes", async () => {
    const body = "éé";
    await expect(
      readBoundedRequestBody(
        new Request("https://cloud.example.com/api/relay/test", { method: "POST", body }),
        4,
      ),
    ).resolves.toEqual({ ok: true, body });
  });
});
