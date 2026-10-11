import { nativeAccountRoute } from "@/lib/server/agent/native-prototype/api";
import { disconnectNativePrototype } from "@/lib/server/agent/native-prototype/connections";

export const runtime = "nodejs";
export const maxDuration = 300;
export const DELETE = nativeAccountRoute(async (_request, userId, engine) => {
  await disconnectNativePrototype(userId, engine);
});
