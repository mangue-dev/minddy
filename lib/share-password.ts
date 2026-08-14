/**
 * La longueur minimale d'un mot de passe de partage (MIN-347) — isomorphe.
 *
 * Le serveur la fait respecter ([lib/server/view-shares.ts](server/view-shares.ts)),
 * les deux dialogues la disent avant d'envoyer. Une seule valeur pour les deux :
 * un formulaire plus permissif que le serveur ne produit qu'un refus qu'on
 * n'avait pas annoncé.
 *
 * Le texte qui l'accompagne (`passwordMinHint`) porte le chiffre en toutes
 * lettres — un message à placeholder appelé sans ses valeurs affiche le chemin
 * de sa clé, et rien ici ne justifie de courir ce risque pour un 8.
 */
export const MIN_SHARE_PASSWORD_LENGTH = 8;
