import { type NextRequest, NextResponse } from "next/server";
import { verifyGithubSignature } from "@/lib/server/git/github-app";

/**
 * POST /api/webhooks/github — récepteur webhook de la GitHub App (MIN-47).
 *
 * INERTE : on vérifie la signature HMAC (`X-Hub-Signature-256`) et on acquitte
 * (200) sans rien traiter. Ainsi le webhook GitHub est « bien configuré » de bout
 * en bout dès maintenant (les livraisons — dont le `ping` initial — réussissent),
 * et l'agent de code (MIN-46) n'aura qu'à brancher la logique de traitement ici.
 *
 * Fail-closed : si le secret est présent et la signature invalide → 401. Si le
 * secret n'est pas (encore) déployé, on acquitte sans vérifier — sans risque,
 * puisque rien n'est traité.
 */
export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const secret = process.env.GITHUB_WEBHOOK_SECRET;

  if (secret) {
    const ok = verifyGithubSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
      secret,
    );
    if (!ok) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  return NextResponse.json({ ok: true });
}
