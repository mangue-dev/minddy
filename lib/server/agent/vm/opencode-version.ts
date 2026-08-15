/**
 * DANS QUELLE VERSION OPENCODE TOURNE, OÙ SON BINAIRE SE TROUVE, ET COMMENT ON
 * L'INSTALLE (MIN-286, lot 3 ; MIN-293).
 *
 * Module SANS AUCUN import, et c'est sa raison d'être : ces valeurs ont
 * **trois** lecteurs qui ne se ressemblent pas —
 *
 *  - [opencode-host.ts](opencode-host.ts), dans le harness, qui installe le
 *    binaire s'il manque et le lance ;
 *  - [scripts/create-agent-snapshot.ts](../../../../scripts/create-agent-snapshot.ts),
 *    sur le poste, qui **cuit** ce même binaire dans l'image pré-chauffée
 *    (`AGENT_SANDBOX_SNAPSHOT_ID`) ;
 *  - le PRÉ-VOL de l'app de bureau (MIN-293,
 *    [desktop/src/opencode-install.ts](../../../../desktop/src/opencode-install.ts)),
 *    qui l'installe avant le fork pour que l'échec ait un journal.
 *
 * Tous doivent poser **exactement le même chemin, exactement la même version et
 * exactement la même commande**, sans quoi le snapshot ne sert à rien : le
 * binaire cuit serait à côté de celui que le harness cherche, ou d'une version
 * que l'épingle refuse, et chaque microVM neuve repaierait les 10,6 s
 * d'installation sans que rien ne le dise. Le script est un `tsx` lancé à la
 * main : il ne peut pas importer `opencode-host.ts` sans traîner tout le
 * superviseur (repo-host, redact, les modèles…) derrière lui. D'où ce fichier-ci,
 * qui n'a rien à traîner.
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

/**
 * LA COMMANDE D'INSTALLATION, ET LES DEUX DRAPEAUX QUI ONT COÛTÉ CHER (MIN-293).
 *
 * ## Ce qui est arrivé, mesuré sur un vrai Mac
 *
 * `npm i opencode-ai@…` lancé avec `cwd` sur un dossier **sans `package.json`**
 * ne s'installe pas là : **npm REMONTE l'arborescence** jusqu'au premier
 * `package.json` qu'il trouve, et installe dedans. Sur le Mac de test, il est
 * remonté de `~/Library/Application Support/minddy-dev/opencode` jusqu'à
 * `/Users/<moi>/package.json`, a posé 144 Mo dans `~/node_modules`, **et s'est
 * ajouté aux dépendances du home**. Le dossier d'installation, lui, est resté
 * vide — et `npm` a rendu **0**.
 *
 * Le harness a donc trouvé son binaire absent, l'a lancé quand même, et a attendu
 * un serveur qui n'existerait jamais. Trois symptômes, une cause, et aucun des
 * trois ne nomme npm.
 *
 * Dans la microVM ça n'était jamais arrivé, et c'était de la CHANCE : les
 * ancêtres de `/vercel/oc` sont `/vercel` et `/`, où il n'y a pas de
 * `package.json`. L'hypothèse n'était écrite nulle part.
 *
 * ## Les deux garde-fous, et pourquoi il en faut deux
 *
 * - **`--prefix`** dit à npm où installer, sans qu'il ait à chercher. C'est lui
 *   qui ferme la porte ;
 * - **le `package.json` posé dans le dossier** ({@link OPENCODE_INSTALL_MANIFEST})
 *   la ferme une seconde fois, et rend le dossier lisible par un humain qui
 *   tombe dessus dans `~/Library/Application Support/`.
 *
 * `--omit=dev` et `--no-audit` ne sont pas du confort : ce dossier n'est pas un
 * projet, personne n'y développe, et un audit réseau de plus retarde un tour.
 */
export function opencodeInstallArgs(
  installDir: string,
  version: string = OPENCODE_VERSION,
): string[] {
  return [
    "install",
    "--prefix",
    installDir,
    "--omit=dev",
    "--no-audit",
    "--no-fund",
    "--silent",
    `opencode-ai@${version}`,
    `@opencode-ai/plugin@${version}`,
  ];
}

/**
 * Le `package.json` du dossier d'installation. Minimal, `private` pour qu'aucune
 * publication ne soit même concevable, et nommé pour qu'on sache d'où il vient.
 */
export const OPENCODE_INSTALL_MANIFEST = `${JSON.stringify(
  {
    name: "minddy-opencode",
    private: true,
    version: "1.0.0",
    description: "Dossier d'installation d'opencode pour minddy — ne rien éditer ici.",
  },
  null,
  2,
)}\n`;

/** Le chemin de ce manifeste. */
export function opencodeInstallManifestPath(installDir: string): string {
  return `${installDir.replace(/\/+$/, "")}/package.json`;
}

/** Le manifeste du paquet INSTALLÉ, d'où l'on relit la version réellement posée. */
export function opencodePackageManifestPath(installDir: string): string {
  return `${installDir.replace(/\/+$/, "")}/node_modules/opencode-ai/package.json`;
}

/** Le runtime TypeScript des tools, partagé au lieu d'être réinstallé par run. */
export function opencodePluginManifestPath(installDir: string): string {
  return `${installDir.replace(/\/+$/, "")}/node_modules/@opencode-ai/plugin/package.json`;
}
