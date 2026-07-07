import { NextResponse, type NextRequest } from "next/server";
import { getTranslations } from "next-intl/server";
import { getAuthedUser } from "@/lib/server/api-auth";
import { connectAgentKey } from "@/lib/server/api-keys";
import { getMcpAgent, isMcpAgentId } from "@/lib/mcp-agents";

/** POST /api/account/api-keys/connect — clé clé-en-main du flow « connecter
    un agent ». Sans `regenerate`, une clé active existante (plaintext
    irrécupérable) est signalée par { exists: true } pour que l'UI demande
    confirmation ; avec `regenerate: true`, elle est révoquée et remplacée.
    Le 201 est le SEUL moment où le plaintext sort du serveur. */
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
  const { agent, regenerate } = (body ?? {}) as {
    agent?: unknown;
    regenerate?: unknown;
  };
  if (!isMcpAgentId(agent)) {
    return NextResponse.json({ error: t("unknownAgent") }, { status: 400 });
  }

  const result = await connectAgentKey({
    userId: auth.user.id,
    agent,
    name: getMcpAgent(agent).label,
    regenerate: regenerate === true,
  });
  if (!result.ok) {
    return NextResponse.json(
      { error: t(result.errorKey) },
      { status: result.status }
    );
  }
  if (result.exists) {
    return NextResponse.json({ exists: true, apiKey: result.apiKey });
  }
  return NextResponse.json(
    { exists: false, apiKey: result.apiKey, key: result.key },
    { status: 201 }
  );
}
