import { defineSandboxProxy } from "@vercel/sandbox/proxy";

import {
  CONTROL_PLANE_MAX_BODY_BYTES,
  handleControlPlaneRequest,
} from "@/lib/server/agent/control-plane";
import { admitLocalCaller, resolveLocalExecSecret } from "@/lib/server/agent/local-exec-token";
import { admitServerExecCaller, resolveServerExecSecret } from "@/lib/server/agent/server-exec-token";
import {
  AGENT_VM_PATH_PREFIX,
  admitSandboxCaller,
  resolveControlPlaneTenant,
} from "@/lib/server/agent/network-policy";

/**
 * Agent microVM CONTROL PLANE (MIN-223) — the only door through
 * which a loop which executes a turn touches the base, the ledger, the tickets
 * and the notebook.
 *
 * TWO INTAKE LANES, AND SINGLE DOOR (MIN-355). They do not prove the
 * same thing in the same way, and everything else — the 413, the body scan, the
 * derivation of the surface, the call to the module — is common to them and is not written
 * only once (`serveControlPlane`).
 *
 * ── PATH 1: THE MICROVM, WHICH HAS NO SECRETS TO CARRY ──────────────────
 *
 * And that's the whole point. `defineSandboxProxy` validates the OIDC that the firewall of
 * Vercel Sandbox posed on the forwarded request (signature against the JWKS of
 * `oidc.vercel.com`, `aud`, validity window) and makes the identity claims of
 * the sending sandbox: team, project, name. Our name being `agent-<run.id>`,
 * the run is designated by a signed claim, never by the body of the request — nothing
 * to take my word for it, nothing that a `env` of the VM can read.
 *
 * BUT THE OIDC ALONE DOES NOT SAY WHICH ACCOUNT WE ARE TALKING ABOUT (MIN-331). The transmitter is
 * common to the entire platform, and the `aud` is the one that the caller himself has
 * asked in the `forwardURL` of ITS network policy: any client
 * Vercel could point his `forwardURL` at our origin, name his sandbox
 * `agent-<uuid for one of our runs>` and pass the three checks — to
 * draw the run's forge token, its checkpoint and its tool surface. What
 * slice is `admitSandboxCaller`: `team_id` and `project_id` are set by the
 * platform, out of reach of the caller, and we demand OURS before even
 * read the name of the sandbox.
 *
 * The `aud` remains checked for what it is worth: it is worth the `forwardURL` of the
 * policy, that is to say the NARE ORIGIN of the deployment (`agentControlOrigin`).
 * The firewall adds the path requested by the VM: the URL that the VM calls and
 * the one that arrives here are therefore literally the same.
 *
 * VALIDITY WINDOW AND REPLAY. `jwtVerify` enforces `exp`/`nbf` (60 s of
 * clock tolerance): an expired token does not pass. Replay has no
 * application guard and does not request one — the token is hit by the firewall
 * AFTER the VM exits (it never sees it, cf. network-policy.ts), it does not
 * only travels in TLS to our origin, and nothing here logs it. A
 * replay therefore supposes having intercepted it on this path, and would only be worth
 * the time that remains — to act on the run that it already designates, and no other.
 *
 * ── PATH 2: THE USER'S MACHINE, WHICH CARRYING A TOKEN ────────────────
 *
 * On a Mac, there is no firewall for signing. `defineSandboxProxy` accepts
 * a SECOND ARGUMENT, called when the `vercel-forwarded-*` headers are missing —
 * with the ORIGINAL query, unconsumed body (checked in
 * `@vercel/sandbox/dist/proxy.js`). The local channel is therefore a `catch` on the
 * existing gate: neither twin route, nor fork, nor second copy of 413.
 *
 * It is guarded by `admitLocalCaller` — an HS256 token `{rid, gen, exp}` that
 * WE signed ([local-exec-token.ts](../../../../lib/server/agent/local-exec-token.ts)).
 * What this token opens is deliberately narrower than what the OIDC opens: it
 * lives on a disk that the model can read, and `control-plane.ts` reduces the
 * power rather than pretending to protect it.
 *
 * WHAT LANDS HERE WITHOUT BEING LOCAL, and why it doesn't make a hole: a
 * well forwarded request whose OIDC is DEFUSED also goes through this second
 * argument. She doesn't have a token of ours — so she goes back to 403, as before.
 * The opposite (a valid local token accompanied by bogus forwarded headers) does not win
 * nothing: the token holder already chooses the surface he is calling.
 *
 * A request without a valid OIDC AND without a token → 403. A sandbox from another
 * tenant, or which is not that of a run → 403 also: it is not a
 * Caller's mistake, he's someone who has no business here. And one
 * deployment which neither knows who it serves nor signs → 503, never a privilege.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** A control plan request is short (an event, a checkpoint, a tool
 * ticket). The slowest tool is a ticket search; 60s covers. */
export const maxDuration = 60;

/**
 * EVERYTHING COMMON TO BOTH PATHS, written once (MIN-355).
 *
 * What differentiates an appellant is his ADMISSION, and nothing else: once the
 * designated run, a local query and a microVM query are the same query.
 * Duplicating these twenty lines would amount to holding two body caps and two
 * surface derivations — that is, to have two different ones one day.
 */
async function serveControlPlane(
  request: Request,
  caller: { runId: string; sandboxName?: string; local?: { gen: number }; server?: true },
): Promise<Response> {
  // The path is the one the caller requested — on channel 1, the proxy
  // rebuilt from `vercel-forwarded-*` headers; on track 2, it is
  // the URL called as is. In both cases, not Next's routing.
  const url = new URL(request.url);
  if (!url.pathname.startsWith(AGENT_VM_PATH_PREFIX)) {
    return Response.json({ error: "off the control plane" }, { status: 404 });
  }
  const surface = url.pathname.slice(AGENT_VM_PATH_PREFIX.length) || "/";

  let body: Record<string, unknown> | null = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const raw = await request.text();
    // 413 EXPLICIT rather than that of the platform (MEASURED: it refuses as soon as
    // ~4.3 MiB, in HTML). A body too large which returns to the error page would be
    // read by the loop as a success — it is the checkpoint that we would lose.
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
    runId: caller.runId,
    method: request.method,
    surface,
    body,
    ...(caller.sandboxName ? { sandboxName: caller.sandboxName } : {}),
    ...(caller.local ? { local: caller.local } : {}),
    ...(caller.server ? { server: true as const } : {}),
  });
  return Response.json(result.body, { status: result.status });
}

const handler = defineSandboxProxy(
  async (request, meta) => {
    const admission = admitSandboxCaller(
      { teamId: meta.teamId, projectId: meta.projectId, sandboxName: meta.sandboxName },
      resolveControlPlaneTenant(),
    );
    if (!admission.ok) {
      // The 503 is a CONFIGURATION failure, not a refusal: it deserves a line,
      // otherwise a deployment without VERCEL_TEAM_ID would break all runs silently.
      if (admission.status === 503) {
        console.error("[agent-vm] VERCEL_TEAM_ID/VERCEL_PROJECT_ID manquants — plan de contrôle fermé");
      }
      return Response.json({ error: admission.error }, { status: admission.status });
    }
    return await serveControlPlane(request, {
      runId: admission.runId,
      sandboxName: meta.sandboxName,
    });
  },
  /**
   * THE LOCAL WAY (MIN-355) — called with the ORIGINAL request and its body
   * intact when nothing has forwarded it. It is the only place from which a tour which does not
   * He doesn't go to Vercel's house to speak, and he only enters with a token of ours.
   */
  async (request) => {
    const serverAdmission = admitServerExecCaller(
      request.headers.get("authorization"),
      resolveServerExecSecret(),
    );
    if (serverAdmission.ok) {
      return await serveControlPlane(request, {
        runId: serverAdmission.runId,
        server: true,
      });
    }
    const admission = admitLocalCaller(
      request.headers.get("authorization"),
      resolveLocalExecSecret(),
    );
    if (!admission.ok) {
      if (admission.status === 503) {
        console.error("[agent-vm] SUPABASE_SERVICE_ROLE_KEY manquante — voie locale fermée");
      }
      return Response.json({ error: admission.error }, { status: admission.status });
    }
    return await serveControlPlane(request, {
      runId: admission.runId,
      local: { gen: admission.gen },
    });
  },
);

export const GET = handler;
export const POST = handler;
export const PUT = handler;
// `DELETE /interrupt`: the loop consumes the “stop” flag when it
// arrived with a message. One more verb, not one more surface — that’s the
// exact counterpart of the `GET /interrupt` that reads it.
export const DELETE = handler;
