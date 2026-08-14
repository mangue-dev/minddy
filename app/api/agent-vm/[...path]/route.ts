import { defineSandboxProxy } from "@vercel/sandbox/proxy";

import {
  CONTROL_PLANE_MAX_BODY_BYTES,
  handleControlPlaneRequest,
} from "@/lib/server/agent/control-plane";
import {
  AGENT_VM_PATH_PREFIX,
  admitSandboxCaller,
  resolveControlPlaneTenant,
} from "@/lib/server/agent/network-policy";

/**
 * PLAN DE CONTRÔLE de la microVM de l'agent (MIN-223) — l'unique porte par
 * laquelle une boucle qui vit dans la VM touche la base, le ledger, les tickets
 * et le carnet.
 *
 * ELLE N'A AUCUN SECRET À TRANSPORTER, et c'est tout l'intérêt.
 * `defineSandboxProxy` valide l'OIDC que le firewall de Vercel Sandbox a posé
 * sur la requête forwardée (signature contre le JWKS de `oidc.vercel.com`,
 * `aud`, fenêtre de validité) et rend les claims d'identité de la sandbox
 * émettrice : team, projet, nom. Notre nommage étant `agent-<run.id>`, le run
 * est désigné par un claim signé, jamais par le corps de la requête — rien à
 * croire sur parole, rien qu'un `env` de la VM puisse lire.
 *
 * MAIS L'OIDC SEUL NE DIT PAS DE QUEL COMPTE ON PARLE (MIN-331). L'émetteur est
 * commun à toute la plateforme, et l'`aud` est celle que l'appelant a lui-même
 * posée dans le `forwardURL` de SA politique réseau : n'importe quel client
 * Vercel pouvait pointer son `forwardURL` sur notre origine, nommer sa sandbox
 * `agent-<uuid d'un run à nous>` et passer les trois vérifications — pour en
 * tirer le jeton de forge du run, son checkpoint et sa surface d'outils. Ce qui
 * tranche est `admitSandboxCaller` : `team_id` et `project_id` sont posés par la
 * plateforme, hors de portée de l'appelant, et on exige les NÔTRES avant même de
 * lire le nom de la sandbox.
 *
 * L'`aud` reste vérifiée pour ce qu'elle vaut : elle vaut le `forwardURL` de la
 * politique, c'est-à-dire l'ORIGINE NUE du déploiement (`agentControlOrigin`).
 * Le firewall append le chemin demandé par la VM : l'URL que la VM appelle et
 * celle qui arrive ici sont donc littéralement la même.
 *
 * FENÊTRE DE VALIDITÉ ET REJEU. `jwtVerify` fait respecter `exp`/`nbf` (60 s de
 * tolérance d'horloge) : un jeton périmé ne passe pas. Le rejeu, lui, n'a pas de
 * garde applicatif et n'en demande pas — le jeton est frappé par le firewall
 * APRÈS la sortie de la VM (elle ne le voit jamais, cf. network-policy.ts), il ne
 * circule qu'en TLS jusqu'à notre origine, et rien ici ne le journalise. Un
 * rejeu suppose donc de l'avoir intercepté sur ce chemin-là, et ne vaudrait que
 * le temps qui reste — pour agir sur le run qu'il désigne déjà, et aucun autre.
 *
 * Une requête sans OIDC valide → 403 (défaut de `defineSandboxProxy`). Une
 * sandbox d'un autre locataire, ou qui n'est pas celle d'un run → 403 aussi : ce
 * n'est pas une erreur de l'appelant, c'est quelqu'un qui n'a rien à faire ici.
 * Et un déploiement qui ne sait pas quel locataire il sert → 503, jamais un
 * passe-droit.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Une requête de plan de contrôle est courte (un event, un checkpoint, un tool
 *  ticket). Le tool le plus lent est une recherche de tickets ; 60 s couvre. */
export const maxDuration = 60;

const handler = defineSandboxProxy(async (request, meta) => {
  const admission = admitSandboxCaller(
    { teamId: meta.teamId, projectId: meta.projectId, sandboxName: meta.sandboxName },
    resolveControlPlaneTenant(),
  );
  if (!admission.ok) {
    // Le 503 est une panne de CONFIGURATION, pas un refus : il mérite une ligne,
    // sinon un déploiement sans VERCEL_TEAM_ID casserait tous les runs en silence.
    if (admission.status === 503) {
      console.error("[agent-vm] VERCEL_TEAM_ID/VERCEL_PROJECT_ID manquants — plan de contrôle fermé");
    }
    return Response.json({ error: admission.error }, { status: admission.status });
  }
  const runId = admission.runId;

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
    sandboxName: meta.sandboxName,
  });
  return Response.json(result.body, { status: result.status });
});

export const GET = handler;
export const POST = handler;
export const PUT = handler;
// `DELETE /interrupt` : la boucle consomme le drapeau de « stop » quand celui-ci
// arrivait avec un message. Un verbe de plus, pas une surface de plus — c'est le
// pendant exact du `GET /interrupt` qui le lit.
export const DELETE = handler;
