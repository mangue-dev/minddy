import { NextResponse, type NextRequest } from "next/server";

import {
  MAX_ACCOUNT_TRANSFER_BYTES,
  validateAccountTransfer,
} from "@/lib/account-transfer";
import { getAuthedUser } from "@/lib/server/api-auth";
import {
  AccountImportScopeError,
  importAccountTransfer,
} from "@/lib/server/account-import";
import { checkSessionRateLimit } from "@/lib/server/session-rate-limit";

export const maxDuration = 120;

/** Import a previously exported account transfer file into the signed-in account. */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const rateLimit = checkSessionRateLimit(auth.user.id, "account-import", {
    limit: 3,
    windowMs: 60 * 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many import requests" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_ACCOUNT_TRANSFER_BYTES) {
    return NextResponse.json({ error: "Transfer file is too large" }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "A JSON transfer file is required" }, { status: 400 });
  }
  if (file.size > MAX_ACCOUNT_TRANSFER_BYTES) {
    return NextResponse.json({ error: "Transfer file is too large" }, { status: 413 });
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    return NextResponse.json({ error: "The transfer file is not valid JSON" }, { status: 400 });
  }
  const validated = validateAccountTransfer(raw);
  if (!validated.ok) {
    return NextResponse.json(
      { error: `Unsupported transfer file: ${validated.field ?? validated.error}` },
      { status: 400 },
    );
  }

  try {
    const result = await importAccountTransfer(validated.document, auth.user.id);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    if (error instanceof AccountImportScopeError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[api/account/import] failed:", (error as Error).message);
    return NextResponse.json({ error: "The transfer could not be completed" }, { status: 500 });
  }
}
