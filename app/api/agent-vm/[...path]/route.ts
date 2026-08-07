import { defineSandboxProxy } from "@vercel/sandbox/proxy";

import {
  CONTROL_PLANE_MAX_BODY_BYTES,
  handleControlPlaneRequest,
} from "@/lib/server/agent/control-plane";
import {
  AGENT_VM_PATH_PREFIX,
  runIdFromSandboxName,
} from "@/lib/server/agent/network-policy";

/**
 * PLAN DE CONTRÔLE de la microVM de l'agent (MIN-223) — l'unique porte par
 * laquelle une boucle qui vit dans la VM touche la base, le ledger, les tickets
 * et le carnet.
 *
 * ELLE N'A AUCUN SECRET À VÉRIFIER, et c'est tout l'intérêt. `defineSandboxProxy`
 * valide l'OIDC que le firewall de Vercel Sandbox a posé sur la requête
 * forwardée (signature, émetteur, expiration, `aud`) et rend le nom de la
 * sandbox émettrice. Notre nommage étant `agent-<run.id>`, **l'identité du run
 * est prouvée par la plateforme et infalsifiable depuis la VM** : rien à
 * transporter, rien à croire sur parole, rien qu'un `env` puisse lire.
 *
 * L'`aud` de l'OIDC vaut le `forwardURL` de la politique, c'est-à-dire l'ORIGINE
 * NUE du déploiement (`agentControlOrigin`). Le firewall append le chemin
 * demandé par la VM : l'URL que la VM appelle et celle qui arrive ici sont donc
 * littéralement la même — le firewall n'y ajoute que l'OIDC. Un appel qui
 * n'aurait pas fait ce chemin arrive sans, et se fait refuser en 403.
 *
 * Une requête sans OIDC valide → 403 (défaut de `defineSandboxProxy`). Une
 * sandbox qui n'est pas celle d'un run → 403 aussi : ce n'est pas une erreur de
 * l'appelant, c'est quelqu'un qui n'a rien à faire ici.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Une requête de plan de contrôle est courte (un event, un checkpoint, un tool
 *  ticket). Le tool le plus lent est une recherche de tickets ; 60 s couvre. */
export const maxDuration = 60;

const handler = defineSandboxProxy(async (request, meta) => {
  const runId = runIdFromSandboxName(meta.sandboxName);
  if (!runId) {
    return Response.json({ error: "not an agent sandbox" }, { status: 403 });
  }

  // Le chemin est celui que la VM a demandé — le proxy le reconstruit depuis les
  // en-têtes `vercel-forwarded-*`, pas depuis le routage Next.
  const url = new URL(request.url);
  if (!url.pathname.startsWith(AGENT_VM_PATH_PREFIX)) {
    return Response.json({ error: "off the control plane" }, { status: 404 });
  }
  const surface = url.pathname.slice(AGENT_VM_PATH_PREFIX.length) || "/";

  let body: Record<string, unknown> | null = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const raw = await request.text();
    // 413 EXPLICITE plutôt que celui de la plateforme (MESURÉ : elle refuse dès
    // ~4,3 Mio, en HTML). Un corps trop gros qui revient en page d'erreur serait
    // lu par la boucle comme un succès — c'est le checkpoint qu'on perdrait.
    if (raw.length > CONTROL_PLANE_MAX_BODY_BYTES) {
      return Response.json(
        { error: `body too large (${raw.length} > ${CONTROL_PLANE_MAX_BODY_BYTES})` },
        { status: 413 },
      );
    }
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      return Response.json({ error: "invalid JSON body" }, { status: 400 });
    }
  }

  const result = await handleControlPlaneRequest({
    runId,
    method: request.method,
    surface,
    body,
  });
  return Response.json(result.body, { status: result.status });
});

export const GET = handler;
export const POST = handler;
export const PUT = handler;
