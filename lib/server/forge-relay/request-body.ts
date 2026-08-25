import "server-only";

export type BoundedRequestBody =
  | { ok: true; body: string }
  | { ok: false; error: "too_large" };

/**
 * Reads at most `maxBytes` from a request body. The declared length is checked
 * first so a known oversized request is rejected without touching its stream;
 * chunked bodies are cancelled as soon as their accumulated bytes cross the
 * same ceiling.
 */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<BoundedRequestBody> {
  const lengthHeader = request.headers.get("content-length");
  if (lengthHeader !== null) {
    const declaredLength = Number(lengthHeader);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      return { ok: false, error: "too_large" };
    }
  }

  if (!request.body) return { ok: true, body: "" };

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

  return {
    ok: true,
    body: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), received).toString("utf8"),
  };
}
