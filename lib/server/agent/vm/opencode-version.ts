/**
 * DANS QUELLE VERSION OPENCODE TOURNE, ET OÙ SON BINAIRE SE TROUVE (MIN-286, lot 3).
 *
 * Module SANS AUCUN import, et c'est sa raison d'être : ces deux valeurs ont
 * **deux** lecteurs qui ne se ressemblent pas —
 *
 *  - [opencode-host.ts](opencode-host.ts), dans la microVM, qui installe le
 *    binaire s'il manque et le lance ;
 *  - [scripts/create-agent-snapshot.ts](../../../../scripts/create-agent-snapshot.ts),
 *    sur le poste, qui **cuit** ce même binaire dans l'image pré-chauffée
 *    (`AGENT_SANDBOX_SNAPSHOT_ID`).
 *
 * Les deux doivent poser **exactement le même chemin et exactement la même
 * version**, sans quoi le snapshot ne sert à rien : le binaire cuit serait à côté
 * de celui que le harness cherche, ou d'une version que l'épingle refuse, et
 * chaque microVM neuve repaierait les 10,6 s d'installation sans que rien ne le
 * dise. Le script est un `tsx` lancé à la main : il ne peut pas importer
 * `opencode-host.ts` sans traîner tout le superviseur (repo-host, redact, les
 * modèles…) derrière lui. D'où ce fichier-ci, qui n'a rien à traîner.
 */

/** La version d'opencode que ce dépôt a mesurée. Voir docs/harness-opencode.md. */
export const OPENCODE_VERSION = "1.18.16";

/**
 * Le binaire, tel que `npm i opencode-ai` le pose dans son dossier d'installation.
 *
 * Le DOSSIER, lui, est une valeur du layout depuis MIN-354
 * (`HarnessLayout.opencodeDir`) : `/vercel/oc` dans la microVM, ailleurs sur une
 * machine ordinaire. Il n'est PAS propre au run — 144 Mo de binaire se partagent
 * entre les runs d'une même machine, et le cuire par run reviendrait à
 * réinstaller à chaque ticket.
 */
export function opencodeBin(installDir: string): string {
  return `${installDir}/node_modules/.bin/opencode`;
}
