# La pull request

Emplacement de landing : `workflowPr`, dernier des trois temps de « Du ticket à
la pull request ». Le texte à côté dit : *« La pull request arrive sur le ticket
avec sa description et son diff, fichier par fichier. Vous relisez, vous
commentez, vous fusionnez. »*

## Pourquoi cette capture est un cas à part

**Le diff n'est pas en base.** minddy le lit **en direct** chez GitHub à chaque
ouverture de l'écran (`app/api/agent-runs/[runId]/pr/route.ts`), avec un jeton
d'installation. Aucune donnée semée ne peut le fabriquer, et le compte de démo
n'a pas de dépôt connecté : poser un `pr_number` sur le run ferait apparaître
une ligne dans la liste, mais l'ouvrir appellerait la forge et échouerait.

Approche retenue, validée avec l'utilisateur : **ouvrir la vraie page et
répondre à sa place aux requêtes de lecture**, avec `page.route()`. Trois
réponses sont fournies par la capture :

| Requête | Ce qu'on renvoie |
|---|---|
| `/api/pull-requests` | une PR, la #128, ouverte, sur AUR-2 |
| `/api/agent-runs/<id>/pr` | l'en-tête de la PR et ses 3 fichiers avec leurs patches |
| `/api/agent-runs/<id>/comments` | une relecture humaine et la réponse de Numo |

`/api/agent/models` et `/api/account/agent-preferences` ne sont **pas**
interceptées : elles répondent normalement pour le compte de démo, il n'y a
aucune raison de les remplacer. `/api/agent-runs/<id>/pr/review-comments`
répondrait `[]` en vrai — on la neutralise pour qu'elle n'aille pas appeler la
forge, mais son contenu reste vide.

**Rien n'est écrit.** Aucun `pr_number` posé, aucune ligne touchée. La page est
la vraie page, l'app est la vraie app ; seules les réponses de trois lectures
sont fournies par le script.

## Ce que l'image doit montrer

- L'en-tête : **AUR-2**, le badge d'état **Ouverte**, et les deux actions —
  refuser, **accepter**. « Vous fusionnez. »
- Le titre du ticket, le badge **Généré par Numo**, le projet Aurora, et le lien
  vers la **#128**.
- L'onglet **Fichiers**, avec les **trois fichiers** et leur diff coloré :
  `lib/palette/actions.ts` (+6 −1), `components/palette/row.tsx` (+14 −2),
  `components/palette/provider.tsx` (+38 −4).
- Le compteur **2** sur l'onglet Conversation : la relecture existe, elle est à
  un clic.

## La continuité avec la capture de l'agent

Même ticket (AUR-2), même titre, même branche
(`numo/aur-2-palette-shortcuts`), mêmes trois fichiers et **exactement les mêmes
totaux** que le bloc « 3 fichiers modifiés +58 −7 » de `workflowAgent`. Les
deux images se lisent comme deux moments d'un même travail — c'est le propos de
la section.

Les patches sont écrits ligne à ligne pour que les compteurs affichés soient
ceux du diff rendu : `+6 −1` en face d'un patch qui ajoute vraiment six lignes.
Un en-tête de hunk faux ou un compteur qui ne tombe pas juste se verrait.

## Description et diff sont deux onglets

Comme pour `workflowIssue`, la consigne du catalogue demande les deux à la fois
— « en-tête branche → branche, description générée, et un diff par fichier ».
`PrDetail` a un onglet **Conversation** (la description ouvre le fil) et un
onglet **Fichiers** (le diff). On photographie le diff : c'est ce qu'on ne peut
pas raconter en texte, et c'est le seul des deux qui soit visuel.

Le « branche → branche » de la consigne n'existe nulle part sur cet écran :
`PullRequestRef` porte bien `head` et `base`, mais `PrDetail` ne les rend pas.
C'est l'écran **Agents** qui montre `main → numo/aur-2-palette-shortcuts`, dans
son composeur — donc la capture précédente.

## Cadrage

1447 × 1085, la fenêtre commune des emplacements 4/3.

## Déclinaisons

fr/light, fr/dark, en/light, en/dark

## Pièges connus

- **Ne jamais intercepter avec un glob trop large.** `**/api/agent-runs/*/pr`
  attraperait aussi `/pr/review-comments` selon l'ordre d'enregistrement. Les
  routes sont posées par prédicat sur le chemin exact.
- **L'onglet Fichiers se désigne par son rang**, comme celui du plan d'un
  ticket : son libellé est traduit et porte le compteur de fichiers.
- **Le run est synthétique.** L'identifiant `demo-pr-aur-2` n'existe pas en
  base : c'est délibéré, il rend impossible qu'une requête non interceptée
  atteigne un vrai run.
