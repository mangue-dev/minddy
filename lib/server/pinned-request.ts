import "server-only";

import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import type { LookupFunction } from "node:net";

/**
 * Une requête HTTP qui se connecte à l'adresse IP qu'on lui donne (MIN-336).
 *
 * C'est la brique qui manque à `fetch` : on peut lui donner une URL, pas une
 * destination. Vérifier le DNS puis appeler `fetch` laisse une seconde
 * résolution se produire, et un domaine qui répond deux adresses différentes
 * (une publique pour le contrôle, une privée pour la connexion) traverse le
 * garde-fou sans le déclencher — c'est le rebinding DNS, un TOCTOU sur le
 * résolveur.
 *
 * `node:http` accepte, lui, une fonction `lookup` : le nom d'hôte reste celui
 * de l'URL (donc l'en-tête `Host` et le SNI TLS sont justes, le certificat est
 * validé contre le vrai domaine) mais la socket part vers l'adresse qu'on a
 * validée, et vers elle seule.
 *
 * Le garde-fou qui décide de cette adresse vit dans
 * [safe-fetch.ts](./safe-fetch.ts) — ici on ne fait qu'obéir.
 */

export interface PinnedResponse {
  status: number;
  headers: Headers;
  /** Corps en flux : à lire avec un plafond, ou à jeter par `destroy()`. */
  stream: NodeJS.ReadableStream;
  destroy(): void;
}

export interface PinnedRequestOptions {
  /** L'adresse IP validée. La socket ne parlera à personne d'autre. */
  address: string;
  headers: Record<string, string>;
  signal: AbortSignal;
}

export function pinnedRequest(
  url: URL,
  { address, headers, signal }: PinnedRequestOptions
): Promise<PinnedResponse> {
  const transport = url.protocol === "https:" ? https : http;
  const family = isIP(address);

  // Node appelle `lookup` avec `{ all: true }` selon les chemins ; les deux
  // formes de callback doivent répondre la même adresse.
  const lookup = ((hostname, options, callback) => {
    if ((options as { all?: boolean }).all) {
      (callback as unknown as (
        err: null,
        addresses: { address: string; family: number }[]
      ) => void)(null, [{ address, family }]);
    } else {
      callback(null, address, family);
    }
  }) as LookupFunction;

  return new Promise<PinnedResponse>((resolve, reject) => {
    const request = transport.request(
      {
        protocol: url.protocol,
        // Les crochets d'une IPv6 littérale appartiennent à l'URL, pas à l'API.
        hostname: url.hostname.replace(/^\[|\]$/g, ""),
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        headers,
        lookup,
        signal,
        // Sans ça, l'agent global mutualise les sockets par nom d'hôte : une
        // connexion déjà ouverte vers une adresse non validée serait réutilisée
        // et notre `lookup` ne serait jamais appelé.
        agent: false,
      },
      (response) => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (value == null) continue;
          for (const one of Array.isArray(value) ? value : [value]) {
            responseHeaders.append(name, one);
          }
        }
        resolve({
          status: response.statusCode ?? 0,
          headers: responseHeaders,
          stream: response,
          destroy: () => response.destroy(),
        });
      }
    );
    request.on("error", reject);
    request.end();
  });
}
