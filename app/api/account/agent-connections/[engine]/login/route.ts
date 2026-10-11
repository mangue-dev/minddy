import { nativeAccountRoute } from "@/lib/server/agent/native-prototype/api";
import { startNativeLogin } from "@/lib/server/agent/native-prototype/connections";

export const runtime = "nodejs";
export const maxDuration = 300;
export const POST = nativeAccountRoute(async (_request, userId, engine) => startNativeLogin(userId, engine));
