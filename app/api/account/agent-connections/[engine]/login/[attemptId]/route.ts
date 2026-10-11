import { nativeAccountRoute, nativeLoginCode } from "@/lib/server/agent/native-prototype/api";
import { cancelNativeLogin, pollNativeLogin, submitNativeLoginCode } from "@/lib/server/agent/native-prototype/connections";

export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = nativeAccountRoute(async (_request, userId, engine, attemptId) => pollNativeLogin(userId, engine, attemptId));
export const PUT = nativeAccountRoute(async (request, userId, engine, attemptId) => submitNativeLoginCode(userId, engine, attemptId, await nativeLoginCode(request)));
export const DELETE = nativeAccountRoute(async (_request, userId, engine, attemptId) => cancelNativeLogin(userId, engine, attemptId));
