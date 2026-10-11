import { isIP } from "node:net";

import { isPrivateAddress } from "@/lib/server/safe-fetch";

/** Validate trusted server configuration without inferring an audience from request headers.
 * Hosted origins must be HTTPS and publicly addressable; DNS/TLS reachability is
 * a separate deployment acceptance check, not a guarantee made by this parser. */
export function parseAgentControlOrigin(value: string, options: { hosted: boolean }): string {
  const url = new URL(value);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Agent control plane requires a bare HTTP(S) origin without credentials");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const literal = host.replace(/^\[|\]$/g, "");
  if (options.hosted && (url.protocol !== "https:" || host === "localhost" ||
      host.endsWith(".localhost") || host.endsWith(".local") ||
      (!isIP(literal) && !host.includes(".")) ||
      (isIP(literal) !== 0 && isPrivateAddress(literal)))) {
    throw new Error("Hosted agent control plane requires a public HTTPS origin");
  }
  return url.origin;
}
