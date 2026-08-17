import "server-only";

import { SITE_URL } from "@/lib/site";
import { orbSeedOr, projectOrbGradient } from "@/lib/project-orb-colors";

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
 * Resend n'est contacté qu'avec `EMAIL_PROVIDER=resend`, sa clé et un expéditeur
 * explicite. `EMAIL_PROVIDER=console` écrit le lien en développement seulement.
 *
 * **Le gabarit est en tableaux et en styles en ligne, à dessein.** Un client
 * mail n'est pas un navigateur : Outlook rend le HTML avec le moteur de Word
 * (ni flexbox, ni grille, ni `border-radius`), Gmail supprime `<style>` sur
 * certains chemins, et personne ne lit `oklch()`. D'où les couleurs de minddy
 * converties en hexadécimal (`lib/project-orb-colors.ts`) et les images en URL
 * absolue sur `SITE_URL` — jamais sur l'`origin` du déploiement, qui peut être
 * une preview inaccessible depuis la boîte de réception.
 */

const RESEND_URL = "https://api.resend.com/emails";
/** La palette de minddy (`app/globals.css` + jetons mangue-ui, thème clair),
    en hexadécimal parce qu'un client mail ne lit pas `oklch()`. */
const INK = "#16181e"; // --primary
const TITLE = "#0a0a0a"; // --foreground
const MUTED = "#606369"; // --muted-foreground
const FAINT = "#8b8e96"; // le pied de page, un cran sous --muted-foreground
const BORDER = "#d9dce5"; // --border
const HAIRLINE = "#eceef3"; // le filet interne à la carte, plus discret
const PAGE = "#f5f7fb"; // --background
const CARD = "#ffffff"; // --card
const ON_INK = "#fafafa"; // --primary-foreground

const FONT =
  "-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface SendInvitationEmailParams {
  to: string;
  /** Nom affiché de qui invite. Vide = compte sans nom ni email lisible : on
      retombe sur « Quelqu'un », dans la langue du mail. */
  inviterName: string;
  projectName: string;
  /** Identifiant du projet — la graine de son orbe quand le tirage n'a jamais
      été relancé (cf. `projectOrbSeed`). */
  projectId: string;
  /** `projects.orb_seed` : la graine relancée, quand elle l'a été. Le mail doit
      peindre la couleur de l'app, pas celle d'avant. */
  projectOrbSeed?: string | null;
  /** L'icône importée du projet, quand il en a une (`projects.icon_url`) ;
      sinon l'orbe dégradé, exactement comme `<ProjectOrb>`. */
  projectIconUrl?: string | null;
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

/**
 * Le lien d'un email d'invitation mène à l'INSCRIPTION (MIN-300), pas à la
 * connexion : arriver par une invitation, c'est très majoritairement ne pas
 * avoir de compte (MIN-197). L'écran ouvrait déjà l'onglet « inscription » dans
 * ce cas ; maintenant que c'est un parcours à part, le lien y va directement.
 * Le wizard porte le retour vers `/login` pour qui a déjà un compte, et le
 * token le suit.
 */
export function invitationLink(token: string, origin: string = SITE_URL): string {
  return `${origin.replace(/\/$/, "")}/signup?invite=${encodeURIComponent(token)}`;
}

/**
 * L'icône du projet, 48 px, coins arrondis — l'image importée si elle en a une,
 * sinon l'orbe. On n'accepte qu'une URL `https://` : une image en `http` fait
 * hurler les clients mail, et une `data:` est soit ignorée, soit un motif de
 * spam.
 */
function projectIconHtml(params: SendInvitationEmailParams): string {
  const url = params.projectIconUrl?.trim();
  if (url && url.startsWith("https://")) {
    return `<img src="${escapeHtml(url)}" width="48" height="48" alt="" style="display:block;width:48px;height:48px;border:1px solid ${BORDER};border-radius:12px;object-fit:cover;" />`;
  }

  const orb = projectOrbGradient(
    orbSeedOr(params.projectId, params.projectOrbSeed),
  );
  // Outlook ignore `border-radius` et `linear-gradient` : il lui reste l'aplat,
  // en carré. C'est la dégradation qu'on accepte — pas une case vide.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="48" style="width:48px;border-collapse:separate;">
              <tr><td height="48" bgcolor="${orb.base}" style="width:48px;height:48px;border-radius:12px;background-color:${orb.base};background-image:linear-gradient(135deg,${orb.from} 0%,${orb.to} 100%);font-size:0;line-height:48px;">&nbsp;</td></tr>
            </table>`;
}

export async function sendInvitationEmail(
  params: SendInvitationEmailParams
): Promise<boolean> {
  const link = invitationLink(params.token, params.origin ?? SITE_URL);
  const provider = process.env.EMAIL_PROVIDER?.trim();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITATION_EMAIL_FROM?.trim();
  if (provider === "console" && process.env.NODE_ENV !== "production") {
    console.log(`[invitation-email] (dev — no RESEND_API_KEY) link for ${params.to}: ${link}`);
    return true;
  }
  if (provider !== "resend" || !apiKey || !from) {
    console.error(
      "[invitation-email] email disabled — set EMAIL_PROVIDER=resend, RESEND_API_KEY and INVITATION_EMAIL_FROM",
    );
    return false;
  }

  const fr = params.locale === "fr";
  const inviter = params.inviterName.trim() || (fr ? "Quelqu'un" : "Someone");
  const subject = fr
    ? `${inviter} vous invite sur « ${params.projectName} »`
    : `${inviter} invited you to "${params.projectName}"`;

  // Le texte qui suit l'objet dans la liste des messages. Sans lui, les clients
  // y recopient le début du corps — ici « minddy », le mot du logo.
  const preheader = fr
    ? `Rejoignez « ${params.projectName} » sur minddy.`
    : `Join "${params.projectName}" on minddy.`;
  const title = fr
    ? `${inviter} vous invite à rejoindre ${params.projectName}`
    : `${inviter} invited you to join ${params.projectName}`;
  const lead = fr
    ? "minddy, c'est là que l'équipe suit ses tickets, ses objectifs et ses retours."
    : "minddy is where the team tracks its issues, objectives and feedback.";
  const cta = fr ? "Rejoindre le projet" : "Join the project";
  const note = fr
    ? `Invitation envoyée à ${params.to}. Créez votre compte avec cette adresse : elle vous rattache au projet.`
    : `This invitation was sent to ${params.to}. Create your account with that address and it will bring you into the project.`;
  const ignore = fr
    ? "Si vous ne connaissez pas cette personne, ignorez cet email — rien ne se passera."
    : "If you don't know this person, ignore this email — nothing will happen.";

  const text = `${title}\n\n${lead}\n\n${cta} : ${link}\n\n${note}\n\n${ignore}\n\nminddy — ${SITE_URL}`;

  const html = `<!doctype html>
<html lang="${fr ? "fr" : "en"}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${PAGE};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${escapeHtml(preheader)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background-color:${PAGE};">
  <tr>
    <td align="center" style="padding:40px 20px;font-family:${FONT};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="480" style="width:100%;max-width:480px;">

        <tr>
          <td style="padding:0 4px 20px;">
            <img src="${SITE_URL}/web-app-manifest-192x192.png" width="28" height="28" alt="" style="display:inline-block;width:28px;height:28px;vertical-align:middle;border:0;border-radius:7px;" />
            <span style="display:inline-block;vertical-align:middle;padding-left:6px;font-family:${FONT};font-size:15px;font-weight:600;letter-spacing:-0.01em;color:${INK};">minddy</span>
          </td>
        </tr>

        <tr>
          <td bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${BORDER};border-radius:16px;padding:32px;">
            ${projectIconHtml(params)}
            <h1 style="margin:20px 0 0;font-family:${FONT};font-size:20px;line-height:1.35;font-weight:600;letter-spacing:-0.015em;color:${TITLE};">${escapeHtml(title)}</h1>
            <p style="margin:10px 0 0;font-family:${FONT};font-size:14px;line-height:1.6;color:${MUTED};">${escapeHtml(lead)}</p>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
              <tr>
                <td bgcolor="${INK}" style="background-color:${INK};border-radius:10px;">
                  <a href="${link}" style="display:inline-block;padding:11px 20px;font-family:${FONT};font-size:14px;font-weight:500;line-height:20px;color:${ON_INK};text-decoration:none;border-radius:10px;">${escapeHtml(cta)}</a>
                </td>
              </tr>
            </table>

            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:24px 0 0;">
              <tr><td height="1" bgcolor="${HAIRLINE}" style="height:1px;line-height:1px;font-size:0;background-color:${HAIRLINE};">&nbsp;</td></tr>
            </table>
            <p style="margin:20px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED};">${escapeHtml(note)}</p>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 4px 0;">
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};">${escapeHtml(ignore)}</p>
            <p style="margin:8px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};"><a href="${SITE_URL}" style="color:${FAINT};text-decoration:none;">minddy.app</a></p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
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
