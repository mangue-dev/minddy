/**
 * No credential travels anymore in the integration prompts (MIN-37): the
 * prompt NAMES an environment variable, the interface shows the LINE to
 * to paste, and the user fills it in. Valid for both channels —
 * the SSO signature secret of the public board, the API key — so that a
 * prompt can stick in a third-party agent, stay open in a tab or
 * go to Numo without having to treat it as a secret.
 *
 * The contract therefore holds in two places which must say exactly the same
 * thing: the name of the variable cited by the prompt, and the line that we copy
 * to fill it. Both come out of here — pure module, read on the server side (the
 * prompts) as well as on the client side (the “to paste in your .env” blocks).
 */

/** Name of the environment variable that carries the SSO signing secret. */
export const SSO_ENV_VAR = "MINDDY_SSO_SECRET";

/** An assignment of `.env` — what we display AND what we copy, everywhere. */
export function envLine(name: string, value: string): string {
  return `${name}=${value}`;
}

/** The SSO secret line of the public board. */
export function ssoEnvLine(secret: string): string {
  return envLine(SSO_ENV_VAR, secret);
}
