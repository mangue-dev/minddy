import "server-only";

import { SITE_URL } from "@/lib/site";

/**
 * L'email d'invitation à un projet (MIN-197) — Resend en fetch brut, comme
 * `lib/server/feedback/otp-email.ts` : pas de SDK, pas de moteur de template.
 *
 * C'est le SEUL email que minddy envoie à quelqu'un qui n'est pas encore
 * utilisateur. Il ne porte donc aucun secret : le `token` du lien n'ouvre rien,
 * il ne fait qu'afficher « X vous invite sur *Projet* » au-dessus du formulaire
 * de connexion. Ce qui rattache la personne au projet, c'est l'email vérifié de
 * sa session (`attachPendingInvitations`), pas ce qu'elle a dans l'URL.
 *
 * Sans `RESEND_API_KEY` (dev), le lien est écrit en console et l'envoi est
 * considéré réussi : le flux complet reste jouable en local. En production,
 * l'absence de clé est une panne — on la journalise et on rend `false`.
 */

const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "minddy <invitations@minddy.app>";

export interface SendInvitationEmailParams {
  to: string;
  /** Nom affiché de qui invite. Vide = compte sans nom ni email lisible : on
      retombe sur « Quelqu'un », dans la langue du mail. */
  inviterName: string;
  projectName: string;
  token: string;
  locale: "fr" | "en";
  /** Origine du site pour ce déploiement (dev/preview/prod). */
  origin?: string;
}

/** `<`, `&`, `"` dans un nom de projet ou d'invitant — jamais dans nos mains. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function invitationLink(token: string, origin: string = SITE_URL): string {
  return `${origin.replace(/\/$/, "")}/login?invite=${encodeURIComponent(token)}`;
}

export async function sendInvitationEmail(
  params: SendInvitationEmailParams
): Promise<boolean> {
  const link = invitationLink(params.token, params.origin ?? SITE_URL);
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error("[invitation-email] RESEND_API_KEY is not set — invitation not sent");
      return false;
    }
    console.log(`[invitation-email] (dev — no RESEND_API_KEY) link for ${params.to}: ${link}`);
    return true;
  }

  const fr = params.locale === "fr";
  const inviter = params.inviterName.trim() || (fr ? "Quelqu'un" : "Someone");
  const subject = fr
    ? `${inviter} vous invite sur « ${params.projectName} »`
    : `${inviter} invited you to "${params.projectName}"`;

  const intro = fr
    ? `${inviter} vous invite à rejoindre le projet « ${params.projectName} » sur minddy.`
    : `${inviter} invited you to join the "${params.projectName}" project on minddy.`;
  const cta = fr ? "Voir l'invitation" : "See the invitation";
  const hint = fr
    ? "Pas encore de compte ? Créez-le avec cette adresse email : l'invitation vous attendra."
    : "No account yet? Create one with this email address and the invitation will be waiting for you.";
  const ignore = fr
    ? "Si vous ne connaissez pas cette personne, ignorez cet email — rien ne se passera."
    : "If you don't know this person, ignore this email — nothing will happen.";

  const text = `${intro}\n\n${cta} : ${link}\n\n${hint}\n\n${ignore}`;
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#18181b;max-width:520px">
  <p style="margin:0 0 20px">${escapeHtml(intro)}</p>
  <p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#18181b;color:#fafafa;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:500">${escapeHtml(cta)}</a></p>
  <p style="margin:0 0 8px;color:#52525b;font-size:14px">${escapeHtml(hint)}</p>
  <p style="margin:0;color:#a1a1aa;font-size:13px">${escapeHtml(ignore)}</p>
</div>`;

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.INVITATION_EMAIL_FROM || DEFAULT_FROM,
        to: [params.to],
        subject,
        text,
        html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error(
        `[invitation-email] Resend error (${response.status}): ${detail.slice(0, 200)}`
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[invitation-email] send failed:", (err as Error).message);
    return false;
  }
}
