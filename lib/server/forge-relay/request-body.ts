import "server-only";

export type BoundedRequestBody =
  | { ok: true; body: string }
  | { ok: false; error: "too_large" };

export type BoundedRequestBytes =
  | { ok: true; body: Uint8Array<ArrayBuffer> }
  | { ok: false; error: "too_large" };

/**
 * Reads at most `maxBytes` from a request body. The declared length is checked
 * first so a known oversized request is rejected without touching its stream;
 * chunked bodies are cancelled as soon as their accumulated bytes cross the
 * same ceiling.
 */
export async function readBoundedRequestBytes(
  request: Request,
  maxBytes: number,
): Promise<BoundedRequestBytes> {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    const declaredLength = Number(lengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return { ok: false, error: "too_large" };
    }
  }

  if (!request.body) return { ok: true, body: new Uint8Array() };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, error: "too_large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body: Uint8Array<ArrayBuffer> = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body };
}

export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedRequestBody> {
  const incoming = await readBoundedRequestBytes(request, maxBytes);
  return incoming.ok
    ? { ok: true, body: Buffer.from(incoming.body).toString("utf8") }
    : incoming;
}
