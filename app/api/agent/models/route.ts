import { NextResponse, type NextRequest } from "next/server";

import { getAuthedUser } from "@/lib/server/api-auth";

/**
 * Index des modèles OpenRouter pour le picker de l'agent (MIN-46). Proxy
 * authentifié vers `/models` (catalogue public) : on ne renvoie que l'id et le
 * nom brut au client, qui reformate lui-même via `formatModelName`. Filtré aux
 * modèles supportant le tool-calling (l'agent en a besoin) et mis en cache
 * process 1 h — le catalogue bouge lentement et l'appel est le même pour tous.
 * Indépendant du BYOK : la liste est la même clé plateforme ou clé perso ; la
 * clé effective n'est résolue qu'au lancement (`resolveAgentApiKey`).
 */

export const runtime = "nodejs";

interface OpenRouterModel {
  id: string;
  name?: string;
  supported_parameters?: string[];
}

export interface AgentModelEntry {
  id: string;
  name: string;
}

const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; models: AgentModelEntry[] } | null = null;

async function loadModels(): Promise<AgentModelEntry[]> {
  const headers: Record<string, string> = {};
  if (process.env.OPENROUTER_API_KEY) {
    headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
  }
  const res = await fetch("https://openrouter.ai/api/v1/models", { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { data?: OpenRouterModel[] };
  return (body.data ?? [])
    .filter((m) => {
      if (!m.id) return false;
      // L'agent est tool-driven : on écarte les modèles qui n'annoncent pas
      // `tools` (mais on garde ceux sans métadonnée déclarée).
      const params = m.supported_parameters;
      return !params?.length || params.includes("tools");
    })
    .map((m) => ({ id: m.id, name: m.name ?? m.id }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

export async function GET(request: NextRequest) {
  const auth = await getAuthedUser(request);
  if (!auth.ok) return auth.response;

  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json({ models: cache.models });
  }
  try {
    const models = await loadModels();
    cache = { at: Date.now(), models };
    return NextResponse.json({ models });
  } catch {
    // Échec réseau : on sert le cache périmé s'il existe, sinon une liste vide
    // (le picker reste utilisable via saisie libre côté serveur).
    return NextResponse.json({ models: cache?.models ?? [] });
  }
}
