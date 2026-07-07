import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { listApiKeys, createApiKey } from "@/lib/server/api-keys";

/** GET /api/account/api-keys — list the caller's personal API keys. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  const apiKeys = await listApiKeys(auth.user.id);
  if (!apiKeys) {
    return NextResponse.json({ error: t("databaseError") }, { status: 500 });
  }
  return NextResponse.json({ apiKeys });
}

/** POST /api/account/api-keys — create a named personal key.
    The 201 response is the ONLY time the plaintext key ever leaves the server. */
export async function POST(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;
  const t = await getTranslations("ApiErrors");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: t("invalidJson") }, { status: 400 });
  }

  const result = await createApiKey({
    userId: auth.user.id,
    name: (body as { name?: unknown })?.name,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status }
    );
  }
  return NextResponse.json(
    { apiKey: result.apiKey, key: result.key },
    { status: 201 }
  );
}
