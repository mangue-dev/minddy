import "server-only";

import { capability } from "@/lib/server/capabilities";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { orbSeedOr, projectOrbGradient } from "@/lib/project-orb-colors";
import {
  ORB_IMAGE_CSS_RADIUS,
  ORB_IMAGE_CSS_SIZE,
  projectOrbImagePath,
} from "@/lib/server/project-orb-image";
import { AVATAR_IMAGE_CSS_SIZE, avatarImagePath } from "@/lib/server/avatar-image";
import type { Locale } from "@/i18n/config";

/**
 * The project invitation email (MIN-197) — Resend via raw fetch, like
 * `lib/server/feedback/otp-email.ts`: no SDK, no template engine.
 *
 * This is the ONLY email that minddy sends to someone who is not yet a
 * user. It therefore carries no secrets: the link's `token` opens nothing;
 * it only displays “X invites you to *Project*” above the sign-up form.
 * What ties the person to the project is the verified email on their session
 * (`attachPendingInvitations`), not anything in the URL.
 *
 * Resend is contacted only when `EMAIL_PROVIDER=resend`, its API key, and an
 * explicit sender are configured. `EMAIL_PROVIDER=console` logs the link only
 * in development.
 *
 * **The template deliberately uses tables and inline styles.** A mail client
 * is not a browser: Outlook renders HTML with the Word engine (no flexbox, grid,
 * or `border-radius`), Gmail removes `<style>` on some paths, and no client reads
 * `oklch()`. That is why minddy's colors are converted to hexadecimal
 * (`lib/project-orb-colors.ts`) and image URLs are absolute on `SITE_URL` — never
 * on the deployment `origin`, which may be a preview inaccessible to the recipient.
 */

const RESEND_URL = "https://api.resend.com/emails";
/** Minddy's palette (`app/globals.css` + `app/tokens.css`, light theme), and the
 * landing's pastel lavender (`components/marketing/card-tones.ts`), in
 * hexadecimal because email clients do not read `oklch()`. */
const INK = "#16181e"; // the name next to the mark, in ink (brand guide)
const ACCENT = "#7059c4"; // --primary, minddy's lavender (MIN-840)
const TITLE = "#0a0a0a"; // --foreground
const MUTED = "#606369"; // --muted-foreground
const FAINT = "#8b8e96"; // footer text, one step lighter than --muted-foreground
const BORDER = "#d9dce5"; // --border
const HAIRLINE = "#eceef3"; // subtle inner rule on the card
const PAGE = "#f5f7fb"; // --background
const CARD = "#ffffff"; // --card
const ON_ACCENT = "#ffffff"; // --primary-foreground
const PASTEL = "#f0ecf6"; // CARD_TONES.lavender, the landing's card surface
const ON_PASTEL = "#433352"; // the text color that goes with it

const FONT =
  "-apple-system,BlinkMacSystemFont,'Inter','Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export interface SendInvitationEmailParams {
  to: string;
  /** Display name of the inviter. Empty means an unnamed account or an unreadable email;
   * it falls back to “Someone” in the email's language. */
  inviterName: string;
  /** The inviter's avatar source (`findAvatarSeed`): drawn before their name in
   * the title, like a member mention. Absent, the name stands alone. */
  inviterAvatar?: string | null;
  projectName: string;
  /** Project identifier — the orb seed used when the color has never been reset
   * (see `projectOrbSeed`). */
  projectId: string;
  /** `projects.orb_seed`: the reset seed, when one exists. The email should use
   * the app's current color, not the previous one. */
  projectOrbSeed?: string | null;
  /** The project's imported icon, when present (`projects.icon_url`); otherwise
   * the fallback orb, exactly like `<ProjectOrb>`. */
  projectIconUrl?: string | null;
  token: string;
  locale: Locale;
  /** Site origin for this deployment (dev/preview/prod). */
  origin?: string;
}

/** Escape `<`, `&`, and `"` in a project or inviter name — never trust either input. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * An invitation email links to SIGN-UP (MIN-300), not login: most people who
 * arrive through an invitation do not have an account yet (MIN-197). The screen
 * already opened the “sign-up” tab in that case; now that it is a separate flow,
 * the link goes there directly. The wizard carries the return to `/login` for
 * people who already have an account, and passes the token along.
 */
export function invitationLink(token: string, origin: string = SITE_URL,
): string {
  return `${origin.replace(/\/$/, "")}/signup?invite=${encodeURIComponent(token)}`;
}

interface InvitationEmailCopy {
  someone: string;
  subject: (inviter: string, project: string) => string;
  preheader: (project: string) => string;
  title: (inviter: string, project: string) => string;
  lead: string;
  cta: string;
  note: (email: string) => string;
  ignore: string;
}

const INVITATION_COPY: Record<Locale, InvitationEmailCopy> = {
  en: {
    someone: "Someone",
    subject: (inviter, project) => `${inviter} invited you to "${project}"`,
    preheader: (project) => `Join "${project}" on minddy.`,
    title: (inviter, project) =>
      `${inviter} invited you to join ${project} on minddy`,
    lead:
      "It's where the team tracks its issues, objectives and feedback.",
    cta: "Join the project",
    note: (email) =>
      `This invitation was sent to ${email}. Create your account with that address and it will bring you into the project.`,
    ignore:
      "If you don't know this person, ignore this email — nothing will happen.",
  },
  fr: {
    someone: "Quelqu'un",
    subject: (inviter, project) => `${inviter} vous invite sur « ${project} »`,
    preheader: (project) => `Rejoignez « ${project} » sur minddy.`,
    title: (inviter, project) =>
      `${inviter} vous invite à rejoindre ${project} sur minddy`,
    lead:
      "C'est là que l'équipe suit ses tickets, ses objectifs et ses retours.",
    cta: "Rejoindre le projet",
    note: (email) =>
      `Invitation envoyée à ${email}. Créez votre compte avec cette adresse : elle vous rattache au projet.`,
    ignore:
      "Si vous ne connaissez pas cette personne, ignorez cet e-mail — rien ne se passera.",
  },
  de: {
    someone: "Jemand",
    subject: (inviter, project) => `${inviter} lädt dich zu „${project}“ ein`,
    preheader: (project) => `Tritt „${project}“ auf minddy bei.`,
    title: (inviter, project) =>
      `${inviter} lädt dich ein, ${project} auf minddy beizutreten`,
    lead:
      "Hier verfolgt das Team seine Tickets, Ziele und sein Feedback.",
    cta: "Projekt beitreten",
    note: (email) =>
      `Diese Einladung wurde an ${email} gesendet. Erstelle dein Konto mit dieser Adresse, um dem Projekt beizutreten.`,
    ignore:
      "Wenn du diese Person nicht kennst, ignoriere diese E-Mail — es passiert nichts.",
  },
  "pt-BR": {
    someone: "Alguém",
    subject: (inviter, project) => `${inviter} convidou você para “${project}”`,
    preheader: (project) => `Participe de “${project}” no minddy.`,
    title: (inviter, project) =>
      `${inviter} convidou você para participar de ${project} no minddy`,
    lead:
      "É aqui que a equipe acompanha seus tickets, objetivos e feedbacks.",
    cta: "Participar do projeto",
    note: (email) =>
      `Este convite foi enviado para ${email}. Crie sua conta com esse endereço para entrar no projeto.`,
    ignore:
      "Se você não conhece essa pessoa, ignore este e-mail — nada acontecerá.",
  },
  it: {
    someone: "Qualcuno",
    subject: (inviter, project) => `${inviter} ti ha invitato a “${project}”`,
    preheader: (project) => `Unisciti a “${project}” su minddy.`,
    title: (inviter, project) =>
      `${inviter} ti ha invitato a unirti a ${project} su minddy`,
    lead:
      "È qui che il team segue i suoi ticket, obiettivi e feedback.",
    cta: "Unisciti al progetto",
    note: (email) =>
      `Questo invito è stato inviato a ${email}. Crea l'account con questo indirizzo per entrare nel progetto.`,
    ignore:
      "Se non conosci questa persona, ignora questa email — non succederà nulla.",
  },
  es: {
    someone: "Alguien",
    subject: (inviter, project) => `${inviter} te ha invitado a «${project}»`,
    preheader: (project) => `Únete a «${project}» en minddy.`,
    title: (inviter, project) =>
      `${inviter} te ha invitado a unirte a ${project} en minddy`,
    lead:
      "Aquí es donde el equipo sigue sus incidencias, objetivos y comentarios.",
    cta: "Unirse al proyecto",
    note: (email) =>
      `Esta invitación se envió a ${email}. Crea tu cuenta con esta dirección para entrar en el proyecto.`,
    ignore:
      "Si no conoces a esta persona, ignora este correo — no ocurrirá nada.",
  },
};

/**
 * The project icon at its email size — the imported image when there is one,
 * otherwise the orb, exactly like `<ProjectOrb>`. We accept only an `https://`
 * URL: an `http` image makes mail clients complain, and a `data:` URL is either
 * ignored or treated as a spam signal.
 *
 * The orb is a PNG painted by `app/og/orb` (MIN-963): mail clients render
 * neither the component's conic gradient nor its blur, and the flat gradient
 * the email used before did not look like the app's orb. The cell under the
 * image keeps the solid color and a linear gradient, so a client that blocks
 * images still shows the project's color — Outlook, which ignores
 * `border-radius` and gradients, as a solid square.
 */
function projectIconHtml(params: SendInvitationEmailParams): string {
  const size = ORB_IMAGE_CSS_SIZE;
  const radius = ORB_IMAGE_CSS_RADIUS;
  const url = params.projectIconUrl?.trim();
  if (url && url.startsWith("https://")) {
    return `<img src="${escapeHtml(url)}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border:0;border-radius:${radius}px;object-fit:cover;" />`;
  }

  const seed = orbSeedOr(params.projectId, params.projectOrbSeed);
  const orb = projectOrbGradient(seed);
  // `SITE_URL`, never the deployment origin: a preview may be closed to the
  // recipient, and image proxies fetch long after the email was sent.
  const src = `${SITE_URL.replace(/\/$/, "")}${projectOrbImagePath(seed)}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${size}" style="width:${size}px;border-collapse:separate;">
                    <tr><td width="${size}" height="${size}" bgcolor="${orb.base}" style="width:${size}px;height:${size}px;border-radius:${radius}px;background-color:${orb.base};background-image:linear-gradient(135deg,${orb.from} 0%,${orb.to} 100%);font-size:0;line-height:0;"><img src="${escapeHtml(src)}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border:0;border-radius:${radius}px;" /></td></tr>
                  </table>`;
}

/** Marks where the inviter's name sits in the title, so the avatar can go before it. */
const INVITER_MARK = "\u0000inviter\u0000";

/**
 * The title with the inviter drawn the way a member mention draws them: their
 * avatar, then their name (`components/mention-chip.tsx`). The avatar is a PNG on
 * `SITE_URL` (`lib/server/avatar-image.ts`); a client that blocks images shows
 * a muted disc in its place.
 */
function titleHtml(
  copy: InvitationEmailCopy,
  inviter: string,
  params: SendInvitationEmailParams,
): string {
  const escaped = escapeHtml(copy.title(INVITER_MARK, params.projectName));
  const path = avatarImagePath(params.inviterAvatar);
  const size = AVATAR_IMAGE_CSS_SIZE;
  const avatar = path
    ? `<img src="${escapeHtml(`${SITE_URL.replace(/\/$/, "")}${path}`)}" width="${size}" height="${size}" alt="" style="display:inline-block;width:${size}px;height:${size}px;margin:0 6px 0 0;vertical-align:-4px;border:0;border-radius:50%;background-color:${HAIRLINE};" />`
    : "";
  return escaped.replace(
    INVITER_MARK,
    `<span style="white-space:nowrap;">${avatar}${escapeHtml(inviter)}</span>`,
  );
}

export interface InvitationEmailContent {
  subject: string;
  text: string;
  html: string;
}

/**
 * The invitation email itself, without sending it — the subject, the plain-text
 * part and the HTML part. The layout follows the landing (MIN-963): a white
 * card holding a pastel lavender panel, where the project shows as it does in
 * the app (its orb or icon, then its name), then the invitation and a pill
 * button in minddy's lavender.
 */
export function renderInvitationEmail(
  params: SendInvitationEmailParams,
): InvitationEmailContent {
  const link = invitationLink(params.token, params.origin ?? SITE_URL);
  const copy = INVITATION_COPY[params.locale];
  const inviter = params.inviterName.trim() || copy.someone;
  const subject = copy.subject(inviter, params.projectName);

  // The text shown after the subject in a message list. Without it, clients may
  // copy the beginning of the body — here “minddy”, the word from the logo.
  const preheader = copy.preheader(params.projectName);
  const title = copy.title(inviter, params.projectName);
  const { lead, cta, ignore } = copy;
  const note = copy.note(params.to);

  const text = `${title}\n\n${lead}\n\n${cta}${params.locale === "fr" ? "\u00a0:" : ":"} ${link}\n\n${note}\n\n${ignore}\n\n${SITE_NAME} — ${SITE_URL}`;

  const html = `<!doctype html>
<html lang="${params.locale}">
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
    <td align="center" style="padding:40px 16px;font-family:${FONT};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="520" style="width:100%;max-width:520px;">

        <tr>
          <td style="padding:0 8px 20px;">
            <img src="${SITE_URL}/web-app-manifest-192x192.png" width="28" height="28" alt="" style="display:inline-block;width:28px;height:28px;vertical-align:middle;border:0;border-radius:7px;" />
            <span style="display:inline-block;vertical-align:middle;padding-left:6px;font-family:${FONT};font-size:15px;font-weight:600;letter-spacing:-0.01em;color:${INK};">minddy</span>
          </td>
        </tr>

        <tr>
          <td bgcolor="${CARD}" style="background-color:${CARD};border:1px solid ${BORDER};border-radius:24px;padding:8px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;border-collapse:separate;">
              <tr>
                <td bgcolor="${PASTEL}" style="background-color:${PASTEL};border-radius:18px;padding:28px 28px 24px;">
                  ${projectIconHtml(params)}
                  <p style="margin:14px 0 0;font-family:${FONT};font-size:15px;line-height:1.4;font-weight:600;letter-spacing:-0.01em;color:${ON_PASTEL};">${escapeHtml(params.projectName)}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 28px 24px;">
                  <h1 style="margin:0;font-family:${FONT};font-size:24px;line-height:1.25;font-weight:500;letter-spacing:-0.03em;color:${TITLE};">${titleHtml(copy, inviter, params)}</h1>
                  <p style="margin:12px 0 0;font-family:${FONT};font-size:15px;line-height:1.6;color:${MUTED};">${escapeHtml(lead)}</p>

                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;border-collapse:separate;">
                    <tr>
                      <td bgcolor="${ACCENT}" style="background-color:${ACCENT};border-radius:999px;">
                        <a href="${link}" style="display:inline-block;padding:12px 24px;font-family:${FONT};font-size:15px;font-weight:500;line-height:20px;color:${ON_ACCENT};text-decoration:none;border-radius:999px;">${escapeHtml(cta)}</a>
                      </td>
                    </tr>
                  </table>

                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:28px 0 0;">
                    <tr><td height="1" bgcolor="${HAIRLINE}" style="height:1px;line-height:1px;font-size:0;background-color:${HAIRLINE};">&nbsp;</td></tr>
                  </table>
                  <p style="margin:20px 0 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED};">${escapeHtml(note)}</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 8px 0;">
            <p style="margin:0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};">${escapeHtml(ignore)}</p>
            <p style="margin:8px 0 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${FAINT};"><a href="${SITE_URL}" style="color:${FAINT};text-decoration:none;">${SITE_NAME}</a></p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, text, html };
}

export async function sendInvitationEmail(
  params: SendInvitationEmailParams,
): Promise<boolean> {
  const link = invitationLink(params.token, params.origin ?? SITE_URL);
  const provider = process.env.EMAIL_PROVIDER?.trim();
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVITATION_EMAIL_FROM?.trim();
  if (provider === "console" && process.env.NODE_ENV !== "production") {
    console.log(
      `[invitation-email] (dev — no RESEND_API_KEY) link for ${params.to}: ${link}`,
    );
    return true;
  }
  const emailCapability = capability("transactionalEmail");
  if (
    !emailCapability.configured ||
    provider !== "resend" ||
    !apiKey ||
    !from
  ) {
    console.error(
      `[invitation-email] email disabled — ${emailCapability.diagnostic}`,
    );
    return false;
  }

  const { subject, text, html } = renderInvitationEmail(params);

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
        `[invitation-email] Resend error (${response.status}): ${detail.slice(0, 200)}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("[invitation-email] send failed:", (err as Error).message);
    return false;
  }
}
