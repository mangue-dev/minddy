import { nativeAccountRoute } from "@/lib/server/agent/native-prototype/api";
import { nativeModelCatalog, refreshNativeModelCatalog } from "@/lib/server/agent/native-prototype/model-catalog";
export const runtime = "nodejs";
export const maxDuration = 300;
export const GET = nativeAccountRoute(async (_request, userId, engine) => nativeModelCatalog(userId, engine));
export const POST = nativeAccountRoute(async (_request, userId, engine) => refreshNativeModelCatalog(userId, engine));
