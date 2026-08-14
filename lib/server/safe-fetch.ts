import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pinnedRequest } from "@/lib/server/pinned-request";

/**
 * La seule sortie HTTP autorisée vers une URL choisie par un utilisateur
 * (MIN-336, partagée par MIN-341).
 *
 * Trois choses qu'un `fetch` nu ne fait pas :
 *
 *  1. **Il refuse ce qui n'est pas publiquement routable** — protocole autre
 *     que http(s), `localhost`, IP privée, lien-local, CGNAT, plages réservées,
 *     et leurs déguisements IPv6 (IPv4 mappée en hexadécimal, 6to4, NAT64).
 *  2. **Il se connecte à l'adresse qu'il a validée**, pas au nom : la
 *     résolution est faite une fois et épinglée sur la socket
 *     ([pinned-request.ts](./pinned-request.ts)). Sans ça, un domaine à double
 *     réponse DNS passe le contrôle puis atteint le réseau interne.
 *  3. **Il borne ce qu'il avale** : chaque redirection est revalidée, le corps
 *     est coupé au plafond d'octets PENDANT la lecture, et un délai global
 *     tient sur toute la chaîne.
 *
 * Ce que ça n'est pas : un client HTTP général. Pas de POST, pas de corps de
 * requête, pas de cookies, pas de compression — on lit des pages et des images.
 */

export type SafeFetchReason =
  /** L'URL elle-même est irrécupérable : protocole, hôte privé, DNS mort. */
  | "url"
  /** L'hôte est légitime mais la requête n'a rien donné d'exploitable. */
  | "unreachable"
  /** Le corps dépasse le plafond d'octets. */
  | "tooLarge";

export class SafeFetchError extends Error {
  constructor(public readonly reason: SafeFetchReason) {
    super(reason);
    this.name = "SafeFetchError";
  }
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_REDIRECTS = 3;

/** Découpe une IPv4 pointée en ses quatre octets, null si ce n'en est pas une. */
function ipv4Octets(address: string): number[] | null {
  if (isIP(address) !== 4) return null;
  return address.split(".").map(Number);
}

/** Développe une IPv6 en ses huit groupes de 16 bits, null si ce n'en est pas
    une. Gère le `::` et la queue en notation pointée (`::ffff:127.0.0.1`). */
function ipv6Groups(address: string): number[] | null {
  if (isIP(address) !== 6) return null;
  let text = address;
  // Une IPv4 en queue vaut deux groupes.
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(text);
  if (tail) {
    const octets = tail[1].split(".").map(Number);
    const hex = [
      ((octets[0] << 8) | octets[1]).toString(16),
      ((octets[2] << 8) | octets[3]).toString(16),
    ].join(":");
    text = `${text.slice(0, tail.index)}${hex}`;
  }
  const [head, rest] = text.split("::");
  const left = head ? head.split(":").filter(Boolean) : [];
  const right = rest ? rest.split(":").filter(Boolean) : [];
  const missing = 8 - left.length - right.length;
  if (rest === undefined) {
    if (left.length !== 8) return null;
    return left.map((g) => parseInt(g, 16));
  }
  if (missing < 0) return null;
  return [...left, ...Array<string>(missing).fill("0"), ...right].map((g) =>
    parseInt(g, 16)
  );
}

/**
 * Les écritures anciennes d'une IPv4 : `2130706433`, `0177.0.0.1`, `0x7f.1`.
 * `inet_aton` les accepte toutes — donc le résolveur du système aussi, et
 * `curl`, et le navigateur — mais `isIP` n'en reconnaît aucune, si bien que le
 * filtre les prendrait pour des noms d'hôte. On les ramène donc à la forme
 * pointée AVANT de décider quoi que ce soit. Une à quatre parties, chacune en
 * décimal, en octal (préfixe `0`) ou en hexadécimal (préfixe `0x`) ; la
 * dernière absorbe les octets restants.
 */
export function legacyIpv4(host: string): string | null {
  if (isIP(host)) return null;
  const parts = host.split(".");
  if (parts.length > 4) return null;
  const values: number[] = [];
  for (const part of parts) {
    let value: number;
    if (/^0[xX][0-9a-fA-F]+$/.test(part)) value = parseInt(part.slice(2), 16);
    else if (/^0[0-7]+$/.test(part)) value = parseInt(part.slice(1), 8);
    else if (/^(0|[1-9][0-9]*)$/.test(part)) value = Number(part);
    else return null;
    if (!Number.isSafeInteger(value) || value < 0) return null;
    values.push(value);
  }
  // Toutes les parties sauf la dernière valent un octet ; la dernière porte le
  // reste (`127.1` = `127.0.0.1`).
  const last = values.pop()!;
  if (values.some((v) => v > 0xff)) return null;
  const rest = 4 - values.length;
  if (last >= 2 ** (8 * rest)) return null;
  const octets = [...values];
  for (let i = rest - 1; i >= 0; i--) octets.push((last >>> (8 * i)) & 0xff);
  return octets.join(".");
}

/** Une IPv4 embarquée dans deux groupes IPv6. */
function embeddedIpv4(high: number, low: number): string {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/**
 * Tout ce qui n'est pas routable sur l'internet public est refusé : privé,
 * loopback, lien-local, CGNAT, multicast, plages de documentation et de test,
 * et — côté IPv6 — les formes qui rhabillent une IPv4 (mappée, 6to4, NAT64).
 * Une adresse écrite `::ffff:c0a8:1` est `192.168.0.1`, et le filtre qui ne lit
 * que la forme pointée la laisse passer.
 */
export function isPrivateAddress(address: string): boolean {
  // Une adresse de lien porte parfois sa zone (`fe80::1%eth0`).
  const bare = address.split("%")[0];

  const octets = ipv4Octets(legacyIpv4(bare) ?? bare);
  if (octets) {
    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // lien-local
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
    if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1
    if (a === 192 && b === 88 && c === 99) return true; // ancien relais 6to4
    if (a === 192 && b === 31 && c === 196) return true; // AS112
    if (a === 192 && b === 52 && c === 193) return true; // AMT
    if (a === 192 && b === 175 && c === 48) return true; // AS112 direct delegation
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmark
    if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
    if (a >= 224) return true; // multicast, réservé, broadcast
    return false;
  }

  const groups = ipv6Groups(bare);
  if (!groups) return false;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  if (groups.every((g) => g === 0)) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && g7 === 1) return true; // ::1
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  if ((g0 & 0xffc0) === 0xfe80) return true; // lien-local fe80::/10
  if ((g0 & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // discard
  // Teredo (2001::/32) transporte DEUX IPv4 dans l'adresse, dont celle du
  // client, obfusquée : plutôt que de les démêler, on refuse la plage — comme
  // le reste de 2001::/23, qui n'est que de l'assignation protocolaire
  // (ORCHIDv2, benchmark…), et 3fff::/20, la documentation moderne.
  if (g0 === 0x2001 && (g1 & 0xfe00) === 0x0000) return true;
  if ((g0 & 0xfff0) === 0x3ff0) return true;
  // IPv4 mappée (::ffff:a.b.c.d) et IPv4 compatible (::a.b.c.d), sous leur
  // forme pointée comme sous leur forme hexadécimale.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0) {
    if (g5 === 0xffff || g5 === 0) return isPrivateAddress(embeddedIpv4(g6, g7));
  }
  if (g0 === 0x0064 && g1 === 0xff9b) return isPrivateAddress(embeddedIpv4(g6, g7)); // NAT64
  if (g0 === 0x2002) return isPrivateAddress(embeddedIpv4(g1, g2)); // 6to4
  return false;
}

/** Une URL http(s) dont l'hôte est publiquement routable, et l'adresse à
    laquelle s'y connecter. Lève `SafeFetchError("url")`. */
export interface ValidatedTarget {
  url: URL;
  address: string;
}

export async function assertPublicHttpUrl(raw: string | URL): Promise<ValidatedTarget> {
  let url: URL;
  try {
    url = raw instanceof URL ? raw : new URL(raw);
  } catch {
    throw new SafeFetchError("url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("url");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  // `0177.0.0.1` n'est pas un nom d'hôte : c'est `127.0.0.1` écrit autrement, et
  // le résolveur le sait. On décide donc sur l'adresse, et on s'y épingle.
  const literal = isIP(host) ? host : legacyIpv4(host);
  if (literal) {
    if (isPrivateAddress(literal)) throw new SafeFetchError("url");
    return { url, address: literal };
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    throw new SafeFetchError("url");
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new SafeFetchError("url");
  }
  // Une seule adresse privée dans la réponse suffit à refuser l'hôte : servir
  // les deux est précisément la manœuvre du rebinding.
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new SafeFetchError("url");
  }
  return { url, address: addresses[0].address };
}

export interface SafeFetchOptions {
  /** Plafond d'octets du corps, appliqué PENDANT la lecture. */
  maxBytes: number;
  /**
   * Ce qu'on fait quand le corps dépasse le plafond. `"error"` par défaut : un
   * fichier tronqué n'est pas un fichier (une image à moitié lue est une image
   * cassée). `"truncate"` pour ce qui se lit par le début — un `<head>` de page
   * est dans les premiers kilo-octets, et jeter le mégaoctet déjà reçu revient
   * à perdre le titre d'un site simplement parce qu'il est gros.
   */
  onOverflow?: "error" | "truncate";
  timeoutMs?: number;
  maxRedirects?: number;
  /** En-têtes de requête, `user-agent` compris. */
  headers?: Record<string, string>;
  /** `GET` par défaut. */
  method?: "GET" | "POST";
  /**
   * Corps de requête (POST). Il n'est PAS rejoué sur une redirection : un
   * appelant qui poste choisit `maxRedirects: 0` — suivre un 302 avec la même
   * charge signée vers un hôte que l'appelant n'a pas choisi n'est pas ce
   * qu'on veut d'un webhook.
   */
  body?: string;
}

export interface SafeResponse {
  status: number;
  ok: boolean;
  headers: Headers;
  /** L'URL finale, redirections suivies — la base des href relatifs. */
  url: URL;
  bytes: Buffer;
  /** Le corps a dépassé le plafond et s'arrête à `maxBytes`. */
  truncated: boolean;
}

export async function safeFetch(
  rawUrl: string | URL,
  options: SafeFetchOptions
): Promise<SafeResponse> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
  const signal = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let target = await assertPublicHttpUrl(rawUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let response;
    try {
      response = await pinnedRequest(target.url, {
        address: target.address,
        headers: {
          // Pas de compression : on lit un plafond d'octets, et un corps
          // compressé mentirait sur ce qu'il coûte à décompresser.
          "accept-encoding": "identity",
          ...(options.body === undefined
            ? {}
            : { "content-length": String(Buffer.byteLength(options.body)) }),
          ...options.headers,
        },
        signal,
        method: options.method,
        body: hop === 0 ? options.body : undefined,
      });
    } catch {
      throw new SafeFetchError("unreachable");
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      response.destroy();
      if (!location || hop === maxRedirects) throw new SafeFetchError("unreachable");
      let next: URL;
      try {
        next = new URL(location, target.url);
      } catch {
        throw new SafeFetchError("url");
      }
      // Chaque saut est un nouvel hôte à valider et à épingler.
      target = await assertPublicHttpUrl(next);
      continue;
    }

    const body = await readCapped(response, options.maxBytes, options.onOverflow ?? "error");
    return {
      status: response.status,
      ok: response.status >= 200 && response.status < 300,
      headers: response.headers,
      url: target.url,
      bytes: body.bytes,
      truncated: body.truncated,
    };
  }
  throw new SafeFetchError("unreachable");
}

/** Lit un corps en flux avec plafond de taille. Le compte se fait sur les
    octets REÇUS — un `content-length` menteur ne fait pas lever le plafond —
    et la lecture est coupée net dès qu'il est atteint : rien au-delà n'est
    téléchargé, encore moins gardé en mémoire. */
async function readCapped(
  response: { headers: Headers; stream: NodeJS.ReadableStream; destroy(): void },
  cap: number,
  onOverflow: "error" | "truncate"
): Promise<{ bytes: Buffer; truncated: boolean }> {
  const declared = Number(response.headers.get("content-length"));
  if (onOverflow === "error" && Number.isFinite(declared) && declared > cap) {
    response.destroy();
    throw new SafeFetchError("tooLarge");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  let truncated = false;
  try {
    for await (const chunk of response.stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (total + buffer.byteLength > cap) {
        if (onOverflow === "error") {
          response.destroy();
          throw new SafeFetchError("tooLarge");
        }
        chunks.push(buffer.subarray(0, cap - total));
        truncated = true;
        break;
      }
      total += buffer.byteLength;
      chunks.push(buffer);
    }
  } catch (err) {
    response.destroy();
    if (err instanceof SafeFetchError) throw err;
    throw new SafeFetchError("unreachable");
  }
  response.destroy();
  return { bytes: Buffer.concat(chunks), truncated };
}
