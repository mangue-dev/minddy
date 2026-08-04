# Une capture = un dossier ici.

`intent.md` (ce que l'image doit montrer), `shot.mjs` (le script), `out/` (les
PNG), `history.jsonl` (un enregistrement par run). Le mode d'emploi est dans le
skill `capture-shot` ; ce fichier ne tient que l'état.

Cible : `CAPTURE_BASE_URL=https://preview.minddy.app`. Les dix captures du
2026-08-04 en viennent, sauf `feedbackInbox` — voir sa ligne.

## Où en sont les onze emplacements

Toutes rafraîchies le **2026-08-04** (commit `2545b33`), après 210 commits sans
reprise.

| Emplacement | Dossier | Cadre | Fenêtre | État |
|---|---|---|---|---|
| `heroBoard` | `hero-board/` | 16/10 | 1736 × 1085 | publié |
| `featureCycle` | `cycle/` | 16/10 | 1736 × 1085 | publié, composition faible (quinzaine décalée) |
| `featurePalette` | `palette/` | 16/10 | 1736 × 1085 | publié |
| `feedbackBoard` | `feedback-board/` | 16/10 | 1736 × 1085 | publié |
| `feedbackInbox` | `feedback-inbox/` | 16/10 | 1736 × 1085 | publié, pris en **local** |
| `workflowIssue` | `issue-create/` | 4/3 | 1447 × 1085 | publié |
| `numoPanel` | `numo/` | 4/3 | **1200 × 900** | publié |
| `workflowPr` | `pull-request/` | 4/3 | 1447 × 1085 | publié |
| `scratchpad` | `carnet/` | 4/3 | 1024 × 768 | publié |
| `workflowAgent` | `agent/` | 4/3 | 1447 × 1085 | publié |

Deux exceptions, chacune motivée dans l'`intent.md` de son dossier :

- **`numoPanel` cadre en 1200 × 900.** Le panneau compact a des métriques fixes,
  c'est donc la fenêtre qui règle sa présence. 1200 est un plancher :
  `--breakpoint-desktop` vaut 1200 px, et en dessous le shell bascule en mise en
  page mobile.
- **`feedbackInbox` a été pris sur `http://localhost:3000`** (avec
  `VERCEL_ENV=preview`, qui rend le logo bleu de preview) : la vue équipe du
  Feedback tombait sur sa frontière d'erreur en preview, et le correctif
  n'était pas encore déployé au moment de la prise.

**Les dix emplacements du catalogue sont publiés.** Le onzième, `voiceDictate`,
a été retiré : la dictée s'illustre par une figure
(`components/marketing/voice-dictation-figure.tsx`) et non par une capture — le
popover n'existe qu'après un `getUserMedia` réussi, et il ne montrerait de toute
façon que le fait d'enregistrer, pas ce que la phrase dite devient.

## La fenêtre dépend du CADRE, pas de l'envie

`<ScreenshotSlot>` rend l'image en `object-cover`. Une capture qui n'a pas le
rapport de son cadre est **rognée au centre**, en silence : une image 16/10 dans
un cadre 4/3 perd 17 % de sa largeur, à parts égales des deux côtés. Sur les
écrans à panneau latéral, ça coupe le sujet.

- **Cadre 16/10 → 1736 × 1085.** Cette largeur tombe pile dans la gouttière qui
  suit la 4ᵉ colonne du board (colonnes de 352, pas de 364).
- **Cadre 4/3 → 1447 × 1085.** Même hauteur, donc même composition verticale que
  les autres ; c'est la largeur qui cède. Allonger la hauteur à 1302 aurait tenu
  l'échelle à l'identique mais laissé un tiers de l'image en gris vide.
- **`scratchpad` déroge** : sa modale fait `90vw × 90vh` quand son contenu a des
  métriques fixes, donc la fenêtre décide de la quantité de blanc autour de la
  note. Voir `carnet/intent.md`.

## Le catalogue n'est pas fiable, le produit fait foi

Sur les neuf emplacements traités, **cinq consignes de
`components/marketing/screenshot-slots.ts` décrivaient une UI qui n'existe
pas** : une route de détail d'issue, une vue « description ET plan » que des
onglets rendent exclusives, des appels d'outils « dépliés » qui ne se déplient
pas, un badge « Ticket en contexte » inatteignable, une réponse d'équipe absente
de la liste du board public. Chaque `intent.md` dit laquelle et pourquoi.

Lire le code de l'écran visé avant d'écrire le script, et corriger l'intention
plutôt que de forcer le produit.

## Ce que les scripts vérifient avant de photographier

Chaque `shot.mjs` échoue avec un message qui dit quoi corriger, plutôt que de
produire une image bancale — une capture verte peut être vide, c'est le mode
d'échec le plus coûteux. Les ancres de contrôle sont des **données** (`AUR-2`,
`lib/palette/actions.ts`, « Before the release »), jamais des libellés traduits :
une attente sur un mot traduit casse une variante sur deux.
