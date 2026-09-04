import "server-only";
import { safeFetchResponse } from "./safe-fetch";
export const MCP_TIMEOUT_MS = 30_000;
export const MCP_MAX_BYTES = 1_048_576;

/** Bound every stream, including SSE, and pin DNS before sending credentials. */
export function mcpFetch(signal: AbortSignal): typeof fetch {
  let totalBytes = 0;
  return async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const target = new URL(url);
    if (
      target.protocol !== "https:" ||
      target.username ||
      target.password ||
      target.hash
    )
      throw new Error("Invalid MCP URL");
    const request = new Request(input, init);
    const requestSignal = AbortSignal.any([signal, request.signal]);
    const response = await safeFetchResponse(url, {
      method: request.method,
      headers: request.headers,
      body: request.body ? await request.text() : undefined,
      signal: requestSignal,
      maxRedirects: 0,
    });
    if (!response.body) return response;
    const body = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          totalBytes += chunk.byteLength;
          if (totalBytes > MCP_MAX_BYTES)
            throw new Error("MCP response too large");
          controller.enqueue(chunk);
        },
      }),
      { signal: requestSignal },
    );
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}
