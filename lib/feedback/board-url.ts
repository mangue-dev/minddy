/**
 * The public URL of a feedback board (MIN-106) — shared client/server.
 *
 * A board responds under TWO hosts: `www.minddy.app/f/<token>` always, and the
 * custom domain of the client (MIN-36) when it has attached one. The authentic one that
 * is the customer's domain — it's their site, not ours, and it's
 * the URL they want to see in their app code.
 *
 * But only once VERIFIED. A `pending` domain is a line in base
 * whose DNS does not yet point anywhere: giving it to an agent who codes a
 * button would produce a dead link, and the failure would only appear in production,
 * among users. As long as Vercel has not confirmed, the reference URL
 * remains the one in `/f/<token>`, which still works.
 *
 * The rule lived until now online in `components/project-feedback-settings.tsx` ;
 * Numo and the MCP server share it now with him.
 */

export interface BoardCustomDomain {
  domain: string;
  status: "pending" | "verified";
}

export function feedbackBoardUrl(input: {
  token: string;
  /** Origin of the minddy site, without final slash (`SITE_URL` server side). */
  origin: string;
  customDomain?: BoardCustomDomain | null;
}): string {
  const custom = input.customDomain;
  if (custom && custom.status === "verified" && custom.domain) {
    return `https://${custom.domain}`;
  }
  return `${input.origin.replace(/\/$/, "")}/f/${input.token}`;
}
