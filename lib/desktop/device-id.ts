import { createHash } from "node:crypto";

/**
 * QUELLE MACHINE EST-CE ? (MIN-293)
 *
 * ## Le problème, et il n'a rien d'hypothétique
 *
 * Sur le poste où on développe minddy, **deux coquilles tournent côte à côte** :
 * l'app installée et celle de `npm run desktop:dev`. Elles ont des profils
 * séparés — `app.setName` ajoute `-dev` hors app empaquetée, et `userData` en
 * dérive ([main.ts](../../desktop/src/main.ts)) — mais **elles partagent la
 * session** dès qu'elles pointent la même origine : les cookies sont par
 * origine, pas par profil.
 *
 * Deux coquilles avec la même session, c'est deux machines qui réclameraient les
 * mêmes runs pour le même compte. Le bail d'exécution locale les départage
 * (émettre, c'est révoquer — [local-exec.ts](../server/agent/local-exec.ts)),
 * mais le départage est un constat après coup : la seconde chasse la première,
 * le premier harness perd son tour, et rien ne dit pourquoi.
 *
 * ## Pourquoi il DÉRIVE de `userData`, au lieu d'être tiré au sort et rangé
 *
 * Un identifiant aléatoire écrit dans un fichier ferait le même travail — et
 * apporterait trois façons de le rater : le fichier peut manquer, être tronqué
 * par un arrêt brutal, ou être recopié tel quel par une restauration Time
 * Machine sur une autre machine. Le chemin de `userData`, lui, est déjà la chose
 * qui distingue les deux profils, il existe avant tout fichier, et il ne se
 * corrompt pas.
 *
 * Il en découle une propriété qu'il faut connaître : **deux Mac dont l'utilisateur
 * porte le même nom court obtiennent le même identifiant**
 * (`/Users/clement/Library/Application Support/minddy`). Ce n'est pas un défaut
 * pour ce à quoi il sert — dire « c'est une autre coquille », pas « c'est un
 * autre ordinateur » — mais ça interdit de s'en servir comme d'une identité
 * d'appareil au sens fort. Le jour où il faudrait ça, c'est le bail qui doit
 * porter la garantie, pas cette chaîne.
 *
 * ## Il n'est pas un secret
 *
 * Il voyage en clair vers le serveur (MIN-294 s'en servira pour le claim) et il
 * n'ouvre rien : c'est le BAIL qui autorise, jamais l'identifiant. Le hash n'est
 * pas là pour cacher le chemin — il est là pour que ce qui voyage soit de
 * longueur fixe et ne porte pas le prénom de quelqu'un.
 */

/** Longueur de l'identifiant. 32 caractères hexadécimaux = 128 bits de hash. */
const DEVICE_ID_LENGTH = 32;

/**
 * L'identifiant de cette coquille, dérivé de son dossier de données.
 *
 * Le chemin est normalisé avant d'être hashé — un slash final, un doublon de
 * séparateur ou une casse différente désignent le même dossier et doivent donner
 * le même identifiant, sans quoi une version de l'app qui construirait le chemin
 * autrement se présenterait comme une nouvelle machine.
 */
export function deviceIdForUserData(userDataPath: string): string {
  return createHash("sha256")
    .update(normalizeUserDataPath(userDataPath), "utf8")
    .digest("hex")
    .slice(0, DEVICE_ID_LENGTH);
}

/**
 * Le chemin ramené à sa forme comparable. Pas de `path.resolve` : ce module est
 * pur et se teste sans système de fichiers, et un chemin de `userData` est
 * toujours absolu — ce qu'on corrige ici, ce sont les seules variations qu'une
 * concaténation peut introduire.
 */
export function normalizeUserDataPath(userDataPath: string): string {
  return userDataPath.trim().replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase();
}

/**
 * COMMENT CETTE COQUILLE SE PRÉSENTE, en clair.
 *
 * L'identifiant ne se lit pas ; ce label, si — il finit dans un journal de tour,
 * dans un rapport de diagnostic, et un jour dans une liste « vos machines ». Il
 * DIT quand c'est la coquille de dév, parce que c'est précisément la confusion
 * qu'on veut rendre impossible : croire regarder la coquille qu'on développe
 * alors qu'on regarde l'app installée est une erreur qu'on a déjà faite ici
 * (cf. le verrou d'instance unique dans `main.ts`).
 */
export function deviceLabel(opts: {
  hostname: string;
  packaged: boolean;
}): string {
  const host = opts.hostname.trim().replace(/\.local$/i, "") || "Mac";
  return opts.packaged ? host : `${host} (dev)`;
}
