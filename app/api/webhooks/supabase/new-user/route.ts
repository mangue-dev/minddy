import { timingSafeEqual } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { notifyNewUser } from "@/lib/server/brrr";
import type { AuthNameMeta } from "@/lib/display-name";

/**
 * POST /api/webhooks/supabase/new-user — « quelqu'un vient de créer un compte »
 * (MIN-117).
 *
 * Database Webhook Supabase posé sur `auth.users`, événements INSERT ET UPDATE.
 *
 * Le signal n'est PAS la création de la ligne, c'est la CONFIRMATION de
 * l'adresse : un compte créé et jamais confirmé n'est pas un utilisateur, et il
 * n'a pas à faire vibrer le téléphone. Ce qu'on guette est donc une TRANSITION —
 * `email_confirmed_at` qui passe de vide à rempli :
 *
 *   INSERT sans `email_confirmed_at`  → rien (inscription par mot de passe, en
 *                                       attente du lien de confirmation)
 *   UPDATE vide → rempli              → PUSH (le lien vient d'être ouvert)
 *   INSERT avec `email_confirmed_at`  → PUSH (OAuth : le provider atteste
 *                                       l'adresse, il n'y a pas d'étape de plus)
 *   UPDATE rempli → rempli            → rien (une simple connexion écrit
 *                                       `last_sign_in_at` sur la même ligne)
 *
 * Tester la transition plutôt que le type d'événement rend la route juste quelle
 * que soit la config du hook : l'élargir côté dashboard ne peut pas transformer
 * les connexions en notifications.
 *
 * Il est ici plutôt que dans `app/auth/callback` parce que ce dernier ne voit
 * que le chemin email : l'inscription OAuth y passe aussi, mais la
 * confirmation d'un compte peut être écrite par d'autres chemins (admin API,
 * ré-envoi), et un seul endroit vaut mieux que deux conditions à tenir
 * synchronisées.
 *
 * FAIL-CLOSED, contrairement au récepteur GitHub : cette route ne fait que
 * notifier, mais son payload décrit un compte utilisateur. Sans secret déployé,
 * n'importe qui pourrait forger un faux signup — on refuse plutôt que d'ouvrir.
 */

/** En-tête où Supabase recopie le secret partagé (Database Webhooks → HTTP Headers). */
const SECRET_HEADER = "x-minddy-webhook-secret";

/**
 * Le monde de démo (skill capture-world) vit dans la base de PRODUCTION : sans
 * ce filtre, chaque seed ferait vibrer le téléphone. Constante et non variable
 * d'environnement — c'est une propriété du dépôt, pas du déploiement. Couvre
 * l'adresse nue et toutes ses sous-adresses (`captures-demo+alice@…`).
 */
const DEMO_EMAIL = /^captures-demo(\+[^@]*)?@minddy\.app$/i;

/** Comparaison à temps constant, longueurs incluses. */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** La ligne `auth.users` telle que Supabase la recopie dans `record`. */
interface AuthUserRecord {
  email?: string | null;
  email_confirmed_at?: string | null;
  raw_user_meta_data?: AuthNameMeta | null;
  raw_app_meta_data?: { provider?: string } | null;
}

/** Une ligne `record`/`old_record` plausible — toute autre forme vaut absence. */
function asAuthUserRecord(v: unknown): AuthUserRecord | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as AuthUserRecord) : null;
}

/** Ne retient des metadata que les trois clés de nom, en chaînes bornées —
    c'est tout ce que `authDisplayName` lit, rien d'autre ne doit passer. */
function sanitizeNameMeta(raw: unknown): AuthNameMeta | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const meta: AuthNameMeta = {};
  if (typeof source.display_name === "string") meta.display_name = source.display_name.slice(0, 200);
  if (typeof source.full_name === "string") meta.full_name = source.full_name.slice(0, 200);
  if (typeof source.name === "string") meta.name = source.name.slice(0, 200);
  return meta;
}

export async function POST(request: NextRequest) {
  const expected = process.env.SUPABASE_WEBHOOK_SECRET;
  if (!expected) {
    console.warn("[webhooks/supabase] SUPABASE_WEBHOOK_SECRET absent — hook refusé");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  if (!secretMatches(request.headers.get(SECRET_HEADER), expected)) {
    return NextResponse.json({ error: "invalid secret" }, { status: 401 });
  }

  // Corps invalide = 400 franc, hors du best-effort : Supabase envoie toujours
  // un objet JSON — toute autre forme est une requête cassée, pas une alerte à
  // acquitter.
  let payload: { record?: unknown; old_record?: unknown };
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "invalid payload" }, { status: 400 });
    }
    payload = parsed as { record?: unknown; old_record?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    const record = asAuthUserRecord(payload.record);
    // La transition, et rien d'autre (voir l'en-tête du fichier). Un DELETE, qui
    // n'a pas de `record`, tombe de lui-même dans « pas confirmé ».
    const confirmed = Boolean(record?.email_confirmed_at);
    const wasConfirmed = Boolean(asAuthUserRecord(payload.old_record)?.email_confirmed_at);
    if (!confirmed || wasConfirmed) {
      return NextResponse.json({
        ok: true,
        skipped: confirmed ? "already_confirmed" : "not_confirmed",
      });
    }

    // Champs bornés avant de partir en push : le payload est authentifié par le
    // secret, mais rien n'oblige à relayer des chaînes démesurées (254 = RFC 5321).
    const email = typeof record?.email === "string" ? record.email.slice(0, 254) : null;
    if (email && DEMO_EMAIL.test(email)) {
      return NextResponse.json({ ok: true, skipped: "demo" });
    }

    const provider = record?.raw_app_meta_data?.provider;
    await notifyNewUser({
      email,
      metadata: sanitizeNameMeta(record?.raw_user_meta_data),
      provider: typeof provider === "string" ? provider.slice(0, 64) : "email",
    });
  } catch (err) {
    // Best-effort : on acquitte quand même, une alerte ratée ne vaut pas une
    // re-livraison en boucle du côté de Supabase.
    console.error("[webhooks/supabase] new-user handling failed:", (err as Error).message);
  }

  return NextResponse.json({ ok: true });
}
