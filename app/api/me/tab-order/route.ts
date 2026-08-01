import { NextResponse, type NextRequest } from "next/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { getTabOrder, setTabOrder } from "@/lib/server/tab-orders";

// Bornes (MIN-118) : le scope est "global" ou un id de projet, une clé est un id
// de vue ou la sentinelle "cycle" — tout est court, et la liste reste petite.
const MAX_SCOPE_LENGTH = 100;
const MAX_KEYS = 100;
const MAX_KEY_LENGTH = 100;

/** GET /api/me/tab-order?scope=<scope> — the caller's tab order for a board
    (scope = "global" or a project id). `keys` is null when never customised. */
export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  const scope = new URL(request.url).searchParams.get("scope");
  if (!scope) {
    return NextResponse.json({ error: "scope is required" }, { status: 400 });
  }
  const keys = await getTabOrder(auth.user.id, scope);
  return NextResponse.json({ keys });
}

/** PUT /api/me/tab-order — persist the caller's tab order for a board. */
export async function PUT(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { scope, keys } = (body ?? {}) as { scope?: unknown; keys?: unknown };
  if (typeof scope !== "string" || !scope || scope.length > MAX_SCOPE_LENGTH) {
    return NextResponse.json({ error: "scope is required" }, { status: 400 });
  }
  if (
    !Array.isArray(keys) ||
    keys.length > MAX_KEYS ||
    !keys.every((k) => typeof k === "string" && k.length <= MAX_KEY_LENGTH)
  ) {
    return NextResponse.json(
      { error: "keys must be an array of strings" },
      { status: 400 }
    );
  }

  const result = await setTabOrder(auth.user.id, scope, keys as string[]);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ keys });
}
