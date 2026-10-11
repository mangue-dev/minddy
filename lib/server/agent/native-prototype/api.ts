import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { withPrivateNoStore } from "@/lib/server/private-response";
import { isNativeHarness, type NativeHarness } from "@/lib/native-agent-prototype";
import { nativePrototypeEnabledFor } from "./access";
import { NativePrototypeError } from "./connections";

type Params = { engine: string; attemptId?: string };
type Context = { params: Promise<Params> };

/** All native outcomes, including denied authentication, are private and uncached. */
export function nativeAccountRoute(
  handler: (request: NextRequest, userId: string, engine: NativeHarness, attemptId: string) => Promise<unknown>,
) {
  return withPrivateNoStore(async (request: NextRequest, context: Context) => {
    const auth = await getAuthedUser(request);
    if (!auth.ok) return auth.response;
    if (!nativePrototypeEnabledFor(auth.user.id)) return NextResponse.json({ errorCode: "private_prototype_unavailable" }, { status: 403 });
    const { engine, attemptId = "" } = await context.params;
    if (!isNativeHarness(engine)) return NextResponse.json({ errorCode: "private_prototype_unavailable" }, { status: 400 });
    try {
      const result = await handler(request, auth.user.id, engine, attemptId);
      return result === undefined ? new NextResponse(null, { status: 204 }) : NextResponse.json(result);
    } catch (error) {
      const errorCode = error instanceof NativePrototypeError ? error.code : "test_failed";
      return NextResponse.json({ errorCode }, { status: errorCode === "connection_busy" ? 409 : 400 });
    }
  });
}

export async function nativeLoginCode(request: NextRequest): Promise<string> {
  // Bound the stream as well as Content-Length; no native transcript or arbitrary
  // CLI command is accepted by this account surface.
  const reader = request.body?.getReader();
  if (!reader) throw new NativePrototypeError("login_failed");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.byteLength;
      if (length > 4096) { await reader.cancel(); throw new NativePrototypeError("login_failed"); }
      chunks.push(item.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => key !== "code") || typeof body.code !== "string") throw new NativePrototypeError("login_failed");
    return body.code;
  } finally { reader.releaseLock(); }
}
