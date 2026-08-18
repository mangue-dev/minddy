/**
 * WHAT IS "ON THE MACHINE, OR ON ITS NETWORK" (MIN-360) — a PUR module, without
 * only one import, because it is read on both sides of a border: by the
 * permission verdict ([opencode-permissions.ts](opencode-permissions.ts), which
 * must remain pure) and by the guardrail which resolves the names
 * ([local-guard.ts](local-guard.ts), which itself does IO).
 *
 * WHY THIS CLASSIFICATION EXISTS. `webfetch` was in `allow` and was therefore
 * NEVER published with permission: in the microVM, the local loop only contained
 * our two servers and the firewall limited the rest. On the user's
 * machine, the same config line reaches the LLM proxy (therefore the key of the
 * model), the tools bridge — **which does not authenticate anything** —, its dev servers, a
 * Ollama, a NAS, and everything that its VPN renders reachable.
 */

/** `tool_result.reason` of a refused `webfetch` — measurable in base. */
export const PRIVATE_FETCH_REASON = "private_fetch";

/**
 * Is this address on the machine, on its local network, or on its VPN?
 *
 * The ranges are those of the ticket, plus two that the field requires: `0.0.0.0/8`,
 * that the network stack routes to the local loop, and `100.64.0.0/10`, which is
 * Tailscale's address space — that is, very concretely, "all that
 * that its VPN makes reachable."
 */
export function isPrivateAddress(raw: string): boolean {
  const address = raw.trim().toLowerCase();
  if (!address) return false;

  // IPv4 mapped to IPv6 (`::ffff:127.0.0.1`): it is the SAME address, and the
  // letting it pass would be enough to bypass all the IPv4 classification below.
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(address);
  if (mapped) return isPrivateAddress(mapped[1]);

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }

  if (!address.includes(":")) return false;
  // IPv6: the loop, the unique-local (`fc00::/7`) and the link-local (`fe80::/10`).
  const bare = address.replace(/^\[|\]$/g, "").split("%")[0];
  if (bare === "::1" || bare === "::") return true;
  if (/^f[cd]/.test(bare)) return true;
  if (/^fe[89ab]/.test(bare)) return true;
  return false;
}

/**
 * Is this NAME refused without even being resolved? Address literals (which
 * no one has to resolve) and suffixes which designate, by construction,
 * only a machine on the local network.
 *
 * An empty name makes `true`: what we cannot read, we do not authorize not.
 */
export function isPrivateHostname(raw: string): boolean {
  const host = raw.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (isPrivateAddress(host)) return true;
  if (host === "localhost") return true;
  return [".localhost", ".local", ".internal", ".home.arpa"].some((suffix) =>
    host.endsWith(suffix),
  );
}

/** The hostname of a URL, or "" if it does not have a readable one. */
export function fetchHostname(raw: string | undefined): string {
  return fetchUrl(raw)?.hostname.replace(/^\[|\]$/g, "") ?? "";
}

/**
 * THE PORT OF AN URL, SCHEME FAULT INCLUDED (MIN-364, decision D8).
 *
 * It is this which distinguishes “the dev server from the user” — which the agent
 * must be able to see rendered, it is the shortest feedback loop which
 * exists — of "the two harness services", which are on the same local loop
 * and which, themselves, do not lend themselves: the LLM proxy carries the key of the model, the
 * tools bridge authenticates NOTHING, and the opencode API responds to who attaches it.
 *
 * `0` when the URL is unreadable: no real port is zero, so no
 * port comparison can accidentally succeed on it.
 */
export function fetchPort(raw: string | undefined): number {
  const url = fetchUrl(raw);
  if (!url) return 0;
  if (url.port) return Number(url.port);
  if (url.protocol === "https:") return 443;
  if (url.protocol === "http:") return 80;
  return 0;
}

function fetchUrl(raw: string | undefined): URL | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const read = (candidate: string): URL | null => {
    try {
      return new URL(candidate);
    } catch {
      return null;
    }
  };
  // A model sometimes writes `example.com/x` without a schema. So we try the same
  // completion that opencode rather than making empty: refuse on a form
  // readable would just be noise, and the address is what decides anyway.
  return read(value) || read(`https://${value}`);
}

/**
 * The word to the model on a refused `webfetch`. A single editorial, read from both sides — the literal refusal and the refusal after resolution say the same thing.
 *
 * ⚠ WHAT IT NO LONGER SAYS (D8): “fetch public URLs only”. The dev server of
 * the user can be reached from MIN-364; what remains refused on the local
 * loop are the PORTS of the harness, and the message names it so that the model
 * does not conclude that `localhost` is closed.
 */
export function privateFetchMessage(hostname: string): string {
  return (
    `Refused fetching ${hostname} — that address and port are the harness's own service ` +
    `(the model proxy, the tool bridge, or the agent server that runs this turn), not a page. ` +
    `They hold this session's credentials and answer to whoever reaches them. Everything else ` +
    `on this machine is fine, your own dev server included.`
  );
}
