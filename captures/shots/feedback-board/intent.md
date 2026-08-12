# Le board public de retours

Emplacement de landing : `feedbackBoard`, à gauche de la vue équipe dans la
section « Feedback ». Cette image-ci montre ce que voient les **utilisateurs**
d'un produit ; sa voisine montre ce que l'équipe en fait.

## Ce que l'image doit montrer

- Le board **trié par votes** : huit retours visibles, de 24 à 2 voix, chacun
  avec son compteur cliquable.
- Des **badges de statut** variés — Ouvert, Prévu, En cours — qui prouvent que
  le board est tenu, pas juste une boîte à idées. Chaque ligne porte aussi
  l'**avatar de son auteur**, et son compteur de commentaires s'il en a.
- Le **champ de recherche** en tête, le filtre d'état replié en un déclencheur
  (« Ouverts »), et le tri « Populaires ».
- Le bouton **Partager un retour**, et l'en-tête « Aurora · Feedback » avec la
  mention « Créé avec minddy ».
- Aucune trace de session : c'est une page publique, vue par quelqu'un qui n'a
  pas de compte. Le seul bouton de connexion est celui du board lui-même.

## Où

`/f/CTxGSyqeTTB85z8crWBwyw` sur `https://www.minddy.app`, **déconnecté**
(`openPage({ authed: false })`).

## Deux choses que l'écran ne montre plus (12 août 2026)

- **La colonne de catégories a disparu.** L'`aside` de droite ne porte plus que
  le bouton « Partager un retour » ; les puces de catégorie ont aussi quitté les
  lignes. C'est une décision de produit, pas une capture ratée — la colonne
  reste donc large et calme sur l'image, et c'est ce que voit un visiteur.
- **« Livré » n'est plus dans le cadre.** Les six pastilles d'état sont repliées
  en un déclencheur unique dont le défaut, « Ouverts », groupe les états vivants
  et laisse l'archive de côté : huit retours au lieu de neuf. `?status=all` les
  ramène tous, mais le « Livré » y est neuvième, sous la ligne de flottaison —
  on ne gagnerait qu'un libellé « Tous » qui ferait croire à une vue filtrée.
  On garde l'URL nue du board.

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
