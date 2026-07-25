# Les retours, côté équipe

Emplacement de landing : `feedbackInbox`, à droite du board public dans la
section « Feedback ». Les deux images se répondent : l'une montre ce que voient
les utilisateurs, l'autre ce que l'équipe en fait.

## Ce que l'image doit montrer

- La **bannière de fusion suggérée par l'IA**, en tête du retour :
  « L'IA suggère de fusionner dans "Slack alerts when an incident opens"
  (91 %) », avec ses deux actions **Fusionner** / **Rejeter**. C'est le seul
  écran où le tri automatique se voit.
- Le retour lui-même — « Can we get notified in Slack? » — son texte, et son
  compteur de **5 votes**.
- Les deux gestes d'équipe : **Promouvoir en issue** et le champ de **Réponse
  d'équipe**, signé « Équipe Aurora ».
- La liste de gauche : neuf retours triés par votes, avec leurs statuts (Ouvert,
  Prévu, En cours, Livré) et le petit repère de fusion sur celui qu'on a ouvert.

## Où

`/projects/6cd36606-c297-4920-8ce3-31b5f3697be8/feedback`, connecté en Camille
Roy, retour « Can we get notified in Slack? » sélectionné.

**Ce retour-là et pas un autre** : la suggestion de fusion n'existe que sur lui
(`world.md`). Sur les huit autres, l'image perdrait ce que la landing met en
avant.

## Cadrage

1736 × 1085 — cadre 16/10, la fenêtre commune.

## Ce qui a été corrigé dans la donnée pour cette capture

La vue équipe affiche l'auteur en toutes lettres : « Auteur : <email> ». Les
votants portaient l'adresse `captures-demo+voterNN@minddy.app`, qui serait
partie sur la landing. `011-votants-emails.mjs` leur a donné des adresses
fictives crédibles — pseudonymes, votes et retours inchangés.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

## Pièges connus

- **Le titre du retour est une donnée anglaise** : c'est l'ancre, valable pour
  les deux langues. Les statuts, eux, sont traduits — ne jamais s'y accrocher.
- **La bannière de fusion arrive après le retour.** Elle vient de colonnes
  d'analyse (`merge_suggestion_*`) rendues avec le détail, pas avec la liste :
  il faut l'attendre explicitement, sinon on photographie le retour sans elle.
- **Le pourcentage est une donnée** (0,91 → « 91 % »), donc une ancre valable
  dans les deux langues. La phrase autour, non.
- **Le FAB de Numo est visible en bas à droite** sur cette page, avec sa pastille
  de contexte. C'est le produit, on le garde.
