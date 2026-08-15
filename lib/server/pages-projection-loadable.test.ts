import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/**
 * jsdom doit se charger DANS LA CONDITION DE VERCEL, pas dans celle du Mac.
 *
 * Ce que ce test garde ne se voit nulle part ailleurs, et a coûté un run
 * entier : `create_page` échouait en production sur
 * `ERR_REQUIRE_ESM … @exodus/bytes`, pendant que la suite était verte et que
 * `npm run dev` marchait. Les deux environnements ne chargent pas les modules
 * de la même façon.
 *
 * Le fait qui explique tout, relevé sur une sonde déployée : la fonction Vercel
 * tourne sur Node v24.18.0 — mais lancé avec **`--no-experimental-require-module`**
 * (`process.execArgv`). L'interop `require()` d'un module ESM, active par défaut
 * depuis Node 22.12, y est donc COUPÉE. Or `jsdom@27+` a fait passer une partie
 * de ses dépendances en ESM-only (`@exodus/bytes` via `html-encoding-sniffer@6`,
 * `@csstools/css-calc` via `@asamuzakjp/css-color`) : le `require` interne de
 * jsdom lève, et avec lui TOUTE écriture de page — l'UI, le MCP, Numo et
 * l'agent de code passent tous par la projection (lib/server/pages-projection.ts).
 *
 * D'où ce test, et sa forme : on relance un Node AVEC LE MÊME DRAPEAU et on lui
 * demande de charger jsdom. C'est la seule façon de voir, depuis un poste où
 * l'interop est active, ce que verra la lambda. Un `npx vitest run` ordinaire
 * ne peut pas le dire : il charge jsdom par le loader de Vite, qui n'a pas ce
 * problème.
 *
 * **Si ce test tombe après un bump de jsdom, ne le contournez pas** : la version
 * choisie est inutilisable en production, quoi qu'en dise la suite. jsdom 26 est
 * la dernière dont le graphe `require` est entièrement CJS.
 */

/** Le drapeau exact que Vercel passe à Node (relevé sur `process.execArgv`). */
const VERCEL_NODE_FLAG = "--no-experimental-require-module";

describe("le DOM serveur de la projection des pages", () => {
  // 20 s pour la même raison que son voisin `pages-md-bundle.test.ts` : le coût
  // de ce cas est un process Node de plus qui charge jsdom, et rien d'autre.
  // Sous le défaut de 5 s, il échouait quand la suite chargeait la machine
  // ailleurs — un échec qui parle d'un délai et jamais de ce qui l'a consommé.
  it("se charge avec l'interop require(ESM) coupée, comme sur Vercel", { timeout: 20_000 }, () => {
    const load = () =>
      execFileSync(
        process.execPath,
        [VERCEL_NODE_FLAG, "-e", "require('jsdom')"],
        { cwd: process.cwd(), stdio: "pipe" }
      );

    expect(load, "jsdom ne se charge plus dans la condition de Vercel").not.toThrow();
  });
});
