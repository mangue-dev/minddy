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
- Les gestes d'équipe de la barre du haut : **Promouvoir en ticket**, **Refuser**
  et leurs chevrons.
- La **table de propriétés** du retour — Voix, Statut, Ticket lié, Type de
  retour, Visibilité, Auteur, Catégories, Créé le — puis l'activité et le
  composeur de commentaire, qui porte sa bascule **Interne / Public**.
- La liste de gauche : huit retours triés par votes, avec leurs statuts, l'email
  de leur auteur, et le petit repère de fusion sur celui qu'on a ouvert.

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

## Ce que l'écran a perdu, et le défaut qui reste (12 août 2026)

Le champ **« Réponse d'équipe »** n'existe plus : la fiche est passée à une
table de propriétés plus un composeur unique à bascule Interne / Public. La
réponse publique ne se rédige donc plus ici — l'intention ci-dessus est
corrigée, pas le produit.

**Les dates de la colonne sont devenues relatives**, et elles sortent FAUSSES :
« dans 5 jours », « dans 1 semaine ». Ce n'est pas un bug de l'app, c'est notre
donnée. `FeedbackRow` reçoit `format.relativeTime(created_at, now)` où `now`
vient de `useNow()` — donc de l'horloge figée des captures, le **15 juillet
2026**. Or `007-feedback.mjs` date ses retours sur la **quinzaine courante au
moment du seed** (`spreadInWindow`), et ils sont tombés les 20-24 juillet :
*après* l'horloge. `world.md` promet pourtant que toute date du monde de démo
est antérieure au 15 juillet — le seed du feedback est le seul à ne pas le tenir.

Tant que les dates affichées étaient absolues (`20/07/2026`), le décalage ne se
voyait pas. Il se voit maintenant, sur huit lignes.

La correction est dans la donnée, pas ici : backdater `created_at` des retours
de démo avant le 15 juillet, par `capture-world` — donc une écriture en base de
production, qui demande l'accord explicite de l'utilisateur.

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

## La prise du 2026-08-04 a été faite en LOCAL, et voici pourquoi

Cet écran ne se rendait plus sur preview : il tombait sur sa frontière d'erreur
(« This page couldn't load »), avec un React #310 — *rendered more hooks than
during the previous render*. La cause était dans `FeedbackDetail`
(`components/feedback/feedback-team-page.tsx`) : `useScrollFade` y était appelé
**après** le `return` du squelette de chargement. Au premier rendu `post` est
nul, on repart tôt, le hook n'existe pas ; au second il apparaît, et l'ordre des
hooks change. Toute vue Feedback d'un projet AYANT des retours tombait — Beacon,
qui n'en a aucun, passait, et la prod, pas encore à jour, aussi. C'est ce qui
rendait la panne discrète.

Le hook est maintenant déclaré avec les autres, avant le `return`.

La capture a été prise sur `http://localhost:3000` lancé avec
**`VERCEL_ENV=preview`** — et non `NEXT_PUBLIC_VERCEL_ENV`, que `next.config.mjs`
réécrit depuis `VERCEL_ENV`. C'est ce qui donne au logo sa teinte bleue de
preview au lieu du rose de développement (`ENV_LOGO_TINT`, `lib/env.ts`).

Deux précautions qui vont avec :

- **les clés PostHog sont vidées au lancement** (`POSTHOG_API_KEY=`,
  `NEXT_PUBLIC_POSTHOG_KEY=`). `VERCEL_ENV=preview` fait passer
  `shouldSendServerAnalytics` à vrai : sans ça, les événements serveur d'un
  `next dev` partiraient vers le projet PostHog de production ;
- **l'indicateur de développement de Next est masqué** par `browser.mjs`
  (`nextjs-portal { display: none }`). Il ne vit que sur `next dev`, donc il
  n'apparaissait sur aucune capture jusqu'ici — et il s'est invité en bas à
  gauche de la première prise locale.

**Rejoué sur preview le 12 août 2026**, correctif déployé : l'écran s'y rend, la
parenthèse locale est refermée.
