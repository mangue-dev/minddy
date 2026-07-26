# Le board public de retours

Emplacement de landing : `feedbackBoard`, à gauche de la vue équipe dans la
section « Feedback ». Cette image-ci montre ce que voient les **utilisateurs**
d'un produit ; sa voisine montre ce que l'équipe en fait.

## Ce que l'image doit montrer

- Le board **trié par votes** : huit retours visibles, de 24 à 2 voix, chacun
  avec son compteur cliquable.
- Des **badges de statut** variés — Ouvert, Prévu, En cours, Livré — qui
  prouvent que le board est tenu, pas juste une boîte à idées.
- Le filtre par statut en tête, le tri « Populaire », et les **catégories en
  colonne latérale**.
- Le bouton **Partager un retour**, et l'en-tête « Aurora · Feedback » avec la
  mention « Créé avec minddy ».
- Aucune trace de session : c'est une page publique, vue par quelqu'un qui n'a
  pas de compte. Le seul bouton de connexion est celui du board lui-même.

## Où

`/f/CTxGSyqeTTB85z8crWBwyw` sur `https://www.minddy.app`, **déconnecté**
(`openPage({ authed: false })`).

## Une consigne du catalogue qui ne survit pas au produit

Le catalogue demande « une réponse d'équipe dépliée sur l'un d'eux ». La liste
du board n'en rend aucune : `teamResponse` n'est lu que par la page d'un retour
(`app/f/[token]/feedback-post-client.tsx`), un clic plus loin. Il faudrait
choisir entre la liste et la réponse ; on garde la liste, qui est le sujet de
l'emplacement — et la réponse d'équipe se voit déjà, côté rédaction, dans
`feedbackInbox`.

## Cadrage

1736 × 1085 — cadre 16/10, la fenêtre commune.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

## Pièges connus

- **Se déconnecter n'est pas cosmétique.** Connecté, l'en-tête remplace
  « S'authentifier » par l'identité du visiteur, et le board n'a plus l'air
  public. `authed: false` est la première ligne du script.
- **Les titres des retours sont des données anglaises**, donc des ancres
  valables pour les deux langues. Les statuts et le tri, eux, sont traduits.
- **Les catégories sont passées en anglais le 26 juillet 2026**, comme le reste
  du monde de démo (`013-categories-en.mjs`). Les PNG de `out/`, plus anciens,
  affichent encore « Fonctionnalité » et « Amélioration » : ils sont à refaire.
  Le sujet produit reste entier — un vrai projet créé en anglais naît toujours
  avec des catégories françaises, c'est le trigger `projects_seed_categories`.
- **Le nombre de votes vient d'un trigger.** Les 95 votes correspondent à des
  lignes réelles ; un compteur écrit à la main dériverait au premier vote.
