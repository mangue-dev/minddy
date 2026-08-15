/**
 * CE QUI EST « SUR LA MACHINE, OU SUR SON RÉSEAU » (MIN-360) — un module PUR, sans
 * une seule importation, parce qu'il est lu des deux côtés d'une frontière : par le
 * verdict de permission ([opencode-permissions.ts](opencode-permissions.ts), qui
 * doit rester pur) et par le garde-fou qui résout les noms
 * ([local-guard.ts](local-guard.ts), qui, lui, fait de l'IO).
 *
 * POURQUOI CE CLASSEMENT EXISTE. `webfetch` était en `allow` et n'était donc
 * JAMAIS publié en permission : dans la microVM, la boucle locale ne contenait que
 * nos deux serveurs et le firewall bornait le reste. Sur la machine de
 * l'utilisateur, la même ligne de config atteint le proxy LLM (donc la clé du
 * modèle), le pont de tools — **qui n'authentifie rien** —, ses serveurs de dév, un
 * Ollama, un NAS, et tout ce que son VPN rend joignable.
 */

/** `tool_result.reason` d'un `webfetch` refusé — mesurable en base. */
export const PRIVATE_FETCH_REASON = "private_fetch";

/**
 * Cette adresse est-elle sur la machine, sur son réseau local, ou sur son VPN ?
 *
 * Les plages sont celles du ticket, plus deux que le terrain impose : `0.0.0.0/8`,
 * que la pile réseau route vers la boucle locale, et `100.64.0.0/10`, qui est
 * l'espace d'adressage de Tailscale — c'est-à-dire, très concrètement, « tout ce
 * que son VPN rend joignable ».
 */
export function isPrivateAddress(raw: string): boolean {
  const address = raw.trim().toLowerCase();
  if (!address) return false;

  // IPv4 mappée en IPv6 (`::ffff:127.0.0.1`) : c'est la MÊME adresse, et la
  // laisser passer suffirait à contourner tout le classement IPv4 ci-dessous.
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
  // IPv6 : la boucle, l'unique-local (`fc00::/7`) et le lien-local (`fe80::/10`).
  const bare = address.replace(/^\[|\]$/g, "").split("%")[0];
  if (bare === "::1" || bare === "::") return true;
  if (/^f[cd]/.test(bare)) return true;
  if (/^fe[89ab]/.test(bare)) return true;
  return false;
}

/**
 * Ce NOM se refuse-t-il sans même être résolu ? Les littéraux d'adresse (que
 * personne n'a à résoudre) et les suffixes qui ne désignent, par construction,
 * qu'une machine du réseau local.
 *
 * Un nom vide rend `true` : ce qu'on ne sait pas lire, on ne l'autorise pas.
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

/** Le nom d'hôte d'une URL, ou "" si elle n'en porte pas de lisible. */
export function fetchHostname(raw: string | undefined): string {
  return fetchUrl(raw)?.hostname.replace(/^\[|\]$/g, "") ?? "";
}

/**
 * LE PORT D'UNE URL, DÉFAUT DE SCHÉMA COMPRIS (MIN-364, décision D8).
 *
 * C'est lui qui distingue « le serveur de dév de l'utilisateur » — que l'agent
 * doit pouvoir aller voir rendre, c'est la boucle de feedback la plus courte qui
 * existe — de « les deux services du harness », qui sont sur la même boucle
 * locale et qui, eux, ne se prêtent pas : le proxy LLM porte la clé du modèle, le
 * pont de tools n'authentifie RIEN, et l'API d'opencode répond à qui la joint.
 *
 * `0` quand l'URL est illisible : aucun port réel ne vaut zéro, donc aucune
 * comparaison de port ne peut réussir par accident dessus.
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
  // Un modèle écrit parfois `example.com/x` sans schéma. On tente donc la même
  // complétion qu'opencode plutôt que de rendre vide : refuser sur une forme
  // lisible ne serait que du bruit, et l'adresse est ce qui décide de toute façon.
  return read(value) || read(`https://${value}`);
}

/**
 * Le mot au modèle sur un `webfetch` refusé. Une seule rédaction, lue des deux
 * côtés — le refus littéral et le refus après résolution disent la même chose.
 *
 * ⚠ CE QU'IL NE DIT PLUS (D8) : « fetch public URLs only ». Le serveur de dév de
 * l'utilisateur est joignable depuis MIN-364 ; ce qui reste refusé sur la boucle
 * locale, ce sont les PORTS du harness, et le message le nomme pour que le modèle
 * ne conclue pas que `localhost` est fermé.
 */
export function privateFetchMessage(hostname: string): string {
  return (
    `Refused fetching ${hostname} — that address and port are the harness's own service ` +
    `(the model proxy, the tool bridge, or the agent server that runs this turn), not a page. ` +
    `They hold this session's credentials and answer to whoever reaches them. Everything else ` +
    `on this machine is fine, your own dev server included.`
  );
}
