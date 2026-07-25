# copy-fix — landing + tarifs

Application de `copy-audit-landing.json` (104 findings, 0 question en suspens).
Aucun commit : relecture par `git diff`.

Fait en deux passes : **phase 1** la copy et les corrections mécaniques,
**phase 2** la restructuration de la page. Les 104 findings sont traités.

- **Appliqués** : 103 findings (86 en phase 1, 17 en phase 2)
- **Sans action, décidé par l'audit lui-même** : 1 (`section-feedback.missing.public-site`)
- **Déjà exact, inchangé** : 1 (`Pricing.faq_refund_a`)
- **Écarté, rien à inventer** : 1 (`structure.no_reassurance`)
- `tsc --noEmit` OK · `vitest run` 369/369 OK · rendu vérifié sur `/` et
  `/pricing` en fr et en : 0 `MISSING_MESSAGE`, 11 ancres résolues sur 11

⚠️ `app/(app)/inbox/page.tsx` était déjà modifié avant cette passe — le `git diff`
mélange donc un changement qui n'a rien à voir avec la copy.

---

## Appliqués

### `messages/fr.json` + `messages/en.json` — 80 modifications par catalogue

Les deux langues sont éditées en miroir (l'audit fournissait `proposed_en` pour
chaque chaîne). Parité des clés vérifiée : `Landing` 145, `Pricing` 18,
`Billing` 59, aucun écart fr/en.

#### Hero et méta — l'angle change

| clé | avant → après |
|---|---|
| `heroTitleBefore` + `heroTitleAccent` | « minddy est le tracker que vos agents / pilotent. » → « Un tracker complet, / et pourtant évident. » |
| `heroSubtitle` | la chaîne ticket → plan → PR → l'énumération complétude + « une seule manière » |
| `heroBadge` | « Serveur MCP inclus » → « …, dès le plan gratuit » |
| `heroNote` | ajout de la limite bloquante des 300 tickets/projet |
| `metaTitle` | « le tracker que vos agents pilotent » → « le tracker de tickets qui reste simple » |
| `metaDescription` | réalignée sur le même angle |

**Découpage `Before`/`Accent` déplacé.** Le `proposed` de l'audit coupait sur
« Un tracker complet, et pourtant / évident. », ce qui ne laissait qu'un mot en
italique — la note du finding demandait explicitement deux mots minimum pour que
la cascade d'animation du hero reste lisible. La phrase est appliquée au mot près,
seule la frontière bouge : `Before` = « Un tracker complet, », `Accent` =
« et pourtant évident. ». Idem en anglais.

#### Corrections factuelles (le gros du lot)

Chaîne réécrite verbatim selon le `proposed` de l'audit, catégorie entre parenthèses :

- `workflow_write_body`, `workflow_run_title`, `workflow_run_body`,
  `workflow_review_body`, `workflowSubtitle` — le parcours agent (dépôt Git
  obligatoire, qui lance, ce que fait le sandbox, la PR qui n'est pas automatique)
  *(stale_mix / missing / unclear)*
- `agentsTitle`, `agentsCapability_track`, `agentsCapability_create`,
  `agentsCapability_comment`, `agentsInstallNote` — plus de « pull request et diff
  à l'appui » (rien n'est jamais attaché), plus de « votre agent ouvre le
  navigateur » *(stale_mix / unclear)*
- `numoSubtitle`, `numoCapability_plan_body`, `numoCapability_find_body`,
  `numoCapability_context_body`, `numoExample_plan` — la PR n'est plus promise
  automatiquement, l'agent de code est nommé « de minddy » *(stale_mix)*
- `voiceTitle`, `voiceSubtitle`, `voice_everywhere_body`, `voiceNote` — le micro
  n'est pas « à côté de chaque champ », le carnet passe par « / » *(stale_mix)*
- `scratchpadSubtitle`, `scratchpadPoint_write`, `scratchpadPoint_agent`,
  `scratchpadPoint_promote` *(stale_mix / unclear / info_overload)*
- `feedback_post_body` (publication différée, cron horaire), `feedback_dedupe_body`
  (suggestion live + fusion auto), `feedback_status_body` (+ « Décliné »),
  `feedbackSubtitle` (sous-domaine, pas domaine) *(stale_mix / unclear)*
- `feature_board_body` (aucune vue liste, groupement toujours par statut),
  `feature_triage_body` (les tickets MCP vont en backlog, pas en triage),
  `feature_cycles_body`, `feature_palette_body`, `feature_board_title`,
  `featuresCaptionCycle`, `featuresCaptionPalette` *(stale_mix)*
- `faq_agents_a` (3 agents sur 7 ne s'installent pas par une commande),
  `faq_byok_a` (BYOK lève le plafond, n'arrête pas le décompte),
  `faq_data_a` (**aucun export de tickets n'existe** — remplacé par l'e-mail RGPD),
  `faq_migrate_a` (**les assignations ne sont jamais importées**), `faq_team_a`,
  `faq_usage_a` *(stale_mix / structure)*
- `pricingSubtitle`, `pricingNote`, `ctaTitle`, `ctaSubtitle` *(stale_mix / unclear)*
- `Pricing.heroTitle`, `heroSubtitle`, `metaDescription`, `comparisonSubtitle`,
  `faq_usage_a`, `faq_overage_a` (budget mensuel même en annuel), `faq_change_a`
  (**« proratisation » retiré** — non vérifiable depuis le repo) *(stale_mix)*
- `Billing.featureBaseUsage` « Usage IA inclus » → « Usage IA de base »,
  `Billing.limitIssuesPerProject` (max) retiré, `en.Billing.billedYearly`
  « Billed {total} €/year » → « Billed €{total}/year » *(structure / inconsistent)*
- EN seuls : `agentsSubtitle`, `numoExample_assign`, `scratchpadPoint_mcp`
  *(inconsistent)*

`Pricing.faq_refund_a` : **inchangé**, l'audit l'a confirmé exact (finding no_change).

#### Cohérence des libellés de CTA (`consistency.signup_cta_labels`)

Règle appliquée — deux libellés au lieu de cinq :

- « Commencer gratuitement » là où le contexte est la promesse d'ensemble :
  `heroCtaPrimary`, `ctaButton`, et **`navGetStarted`** (« Commencer » → « Commencer
  gratuitement », EN « Get started » → « Start for free »)
- « Créer un compte » sur les cartes de tarifs : `pricingCtaPaid` (déjà) et
  **`pricingCtaFree`** (« Commencer gratuitement » → « Créer un compte »)

> À vérifier à l'œil : le bouton de nav s'allonge nettement. Si ça casse la barre
> en mobile, dis-le — on inverse la règle plutôt que de garder trois libellés.

#### Vouvoiement et terminologie

- `featuresSubtitle` : « Un tracker **qu'on** ouvre » → « **que vous** ouvrez »
- `numoExamplesTitle` : « Ce **qu'on lui demande**, en vrai » → « Ce **que vous lui
  demandez**, en vrai ». L'audit citait la phrase sans « , en vrai » ; la queue est
  conservée, seule la transformation proposée est appliquée.
- `feedbackCaptionBoard` : « on propose, on vote » → « **vos utilisateurs**
  proposent, votent » (variante explicitement retenue par le finding)
- `feedbackSubtitle` + `feedback_decide_body` : « la même **demande** » / « promouvez
  la **demande** » → « le même **retour** » / « promouvez le **retour** », par la
  règle « retour = nom de l'objet en français ». « demandent » (verbe) dans
  `feedbackTitle` et « board de feedback » (nom du produit) sont conservés.

### Nouvelles clés

| clé | où |
|---|---|
| `Landing.agentsCapability_review` / `_beyond` | +2 puces dans la section MCP |
| `Landing.feature_all_title` / `_body`, `feature_inbox_title` / `_body` | +2 cartes dans la grille |
| `Pricing.faq_mcp_q` / `_a`, `faq_byok_q` / `_a` | +2 questions sur /pricing |

Phase 2 en ajoute 20 de plus (`speed*`, `more_*`, `feature_objectives_*`,
`agentsPlanNote`, `navAgents`, `footerSpeed`, `footerMore`) — détail plus bas.

### `components/marketing/voice-dictation-figure.tsx`

`Landing.voiceFigureDue` **supprimé des deux catalogues**. La date était écrite en
dur (« ven. 24 juil. ») et affichait déjà une échéance passée. Elle est maintenant
calculée au rendu par `nextFriday(locale)` — prochain vendredi, le vendredi en
cours ne comptant pas, formaté par `Intl.DateTimeFormat` donc correct dans les deux
langues. Vérifié : la page marketing n'est pas prérendue (le layout lit la session
pour rediriger un visiteur connecté), aucun `revalidate` ni `force-static` — la
date suit bien le calendrier.

### `components/marketing/screenshot-slots.ts`

Trois consignes de capture décrivaient une UI inexistante :

- `workflowIssue` — `route` corrigée : `/projects/<id>/issues/<identifier>` **n'existe
  pas**, le détail d'un ticket est un panneau latéral. `shot` corrigé : description
  et plan sont deux onglets exclusifs.
- `numoPanel` — `route` et `shot` corrigés : mode étendu, les lignes d'action ne se
  déplient pas, le badge de contexte est dans le composeur (en bas), pas en haut.
- `workflowPr` — `shot` corrigé : la page Pull requests (liste + détail), onglet
  « Fichiers modifiés » à basculer à la main.

### La grille produit (fichier renommé en phase 2 → `section-tracker.tsx`)

Grille portée de 4 à 6 cartes. **Icônes changées, décision de ma part** : `Inbox`
était prise par la carte Triage, elle revient à la carte Inbox ; Triage passe à
`ListFilter`, « Tous vos projets » prend `Layers`, « Objectifs » prend `Target`.
À revoir si tu as mieux.

État final après phase 2 — board → tous les projets → inbox → objectifs → cycles →
triage. La palette ⌘K a quitté la grille pour ouvrir §3.

### `components/marketing/structured-data.tsx`

Nœud `offers` ajouté à `SoftwareApplication` : un `AggregateOffer` EUR
(lowPrice 0, highPrice 20) et trois `Offer` **dérivées de `BILLING_PLANS`**, jamais
recopiées, avec les noms de plans lus dans `Billing.planFree/Go/Pro`. Chaque offre
porte une `UnitPriceSpecification` mensuelle, sinon le prix se lit comme un
paiement unique.

### `app/(marketing)/opengraph-image.tsx`

Copies figées resynchronisées sur les nouvelles `en.Landing.metaTitle` /
`metaDescription` (`alt`, titre, sous-titre) — sans quoi la vignette de partage
continuait d'annoncer « open the pull request ». Consigne de resynchronisation
manuelle inscrite dans le commentaire d'en-tête, comme le proposait l'audit.

---

## Phase 2 — la restructuration

`structure.page_plan` et ses cinq findings liés. **9 sections de contenu → 6.**

| # | Section | Ancre | D'où elle vient |
|---:|---|---|---|
| 1 | Hero | — | réécrit en phase 1 |
| 2 | Le tracker | `#tracker` | ex-`#features`, remontée de la 8ᵉ à la 2ᵉ place |
| 3 | Fait pour aller vite | `#speed` | **nouvelle** — absorbe la palette, la dictée, le carnet |
| 4 | Vos agents travaillent dedans | `#agents` | fusion Workflow + MCP + Numo |
| 5 | Les retours de vos utilisateurs | `#feedback` | inchangée, remonte d'une place |
| 6 | Et le reste est déjà là | `#more` | **nouvelle**, bande courte |
| 7-9 | Tarifs · FAQ · CTA | | inchangés |

Page rendue : 13 169 px, contre 9 sections de contenu auparavant. Le gain n'est
pas dans la hauteur, il est dans l'ordre : le produit apparaît en 2ᵉ position au
lieu de la 8ᵉ, et le lecteur ne lit plus trois fois le même geste.

### Fichiers

- `section-features.tsx` → **`section-tracker.tsx`** (`git mv`, la fonction devient
  `SectionTracker`, ancre `#tracker`)
- **`section-speed.tsx`** — nouveau
- **`section-more.tsx`** — nouveau
- `section-agents.tsx` — réécrit, absorbe `section-workflow` et `section-numo`
- **supprimés** : `section-workflow.tsx`, `section-voice.tsx`,
  `section-scratchpad.tsx`, `section-numo.tsx`
- `page.tsx`, `marketing-nav.tsx`, `marketing-footer.tsx` — ordre et ancres

### §2 — Le tracker (`#tracker`)

Le titre « Tout ce qu'il faut. Rien de plus. » **n'a pas bougé** : il arrivait après
six sections qui le contredisaient, il ouvre maintenant au lieu de conclure. La
grille passe à 6 cartes — ajout de **Objectifs**
(`structure.objectives_never_explained`, chaîne verbatim de l'audit), et la palette
⌘K **quitte** la grille pour ouvrir §3.

Une seule capture reste ici (le cycle) : elle passe pleine largeur plutôt que de
rester seule dans une grille à deux colonnes.

### §3 — Fait pour aller vite (`#speed`) · nouvelle

La section qui manquait le plus : la page ne défendait la simplicité que par le
nombre d'écrans, jamais par le nombre de gestes. Trois blocs sous un H2 :

1. **le clavier** — capture de la palette + `feature_palette_title` / `_body`
2. **la voix** (`#voice`) — la section Dictée entière, en `h3` au lieu de `h2`
3. **le carnet** (`#scratchpad`) — idem

Nouvelles clés : `speedTitle`, `speedSubtitle` (verbatim de l'audit) et
`speedShortcuts` — **ligne que j'ai écrite**, à partir des cinq raccourcis que
l'audit cite et que d'autres findings vérifient chacun de leur côté (G puis I,
G puis N, G puis A, ⇧V, ⇧A).

### §4 — Vos agents travaillent dedans (`#agents`)

Fusion des trois sections qui racontaient le même geste. Un seul fil : le
branchement (MCP, encart d'installation, 7 capacités) → le parcours en 3 temps
(`#workflow`) → Numo depuis l'app (`#numo`).

Nouvelle clé `agentsPlanNote`, sous l'encart d'installation : **le serveur MCP est
inclus dans tous les plans, seul l'agent Numo demande Go ou Pro.** C'est ce que la
page taisait et qui transformait sa force en objection — dérivé de la réponse FAQ
`Pricing.faq_mcp_a` ajoutée en phase 1, donc cohérent d'une page à l'autre.

**Clés supprimées** : `numoCapability_plan_title` / `_body`. La capacité « Il
planifie, puis il lance » redisait mot pour mot le parcours en 3 temps qui la
précède maintenant dans la même section — c'est la redite que
`three_sections_same_story` demandait de retirer. La chaîne que j'avais réécrite en
phase 1 disparaît donc avec elle.

### §6 — Et le reste est déjà là (`#more`) · nouvelle

Bande courte, sans capture, quatre lignes. Verbatim de l'audit pour les vues
partagées et l'API/webhooks ; **titre, sous-titre et deux lignes écrites par moi**
(voir « Copy que j'ai écrite » plus bas).

### Les ancres survivent au découpage

`#voice`, `#scratchpad`, `#workflow` et `#numo` ne sont plus des sections mais
restent des ancres, posées sur les blocs qui les ont absorbés. Les liens du pied de
page et tout lien déjà partagé tombent au bon endroit. Vérifié au rendu : les
11 ancres référencées existent toutes dans le HTML.

### La nav (`structure.nav_out_of_sync`)

`Le tracker (#tracker) · Les agents (#agents) · Tarifs (#pricing) · FAQ (#faq)`.
Avant : `#workflow` et `#features`, deux ancres qui n'existent plus comme sections,
et `#agents` — cible du badge du hero — absent.

« Tarifs » vise maintenant la section de la landing et non `/pricing`, comme le
demande le finding ; le comparatif complet reste à un clic par « Comparer les plans
en détail ».

> Divergence signalée : le finding propose **4** entrées, le récapitulatif en tête
> de `copy-audit-landing.md` en propose **5** (avec « Aller vite »). J'ai suivi le
> finding — c'est l'artefact normatif — et `#speed` reste accessible par le pied de
> page.

### Les deux arbitrages que j'avais laissés ouverts

**`consistency.section_badges_no_rule` — tranché.** La règle posée par l'audit
(« un badge uniquement quand il nomme une fonctionnalité que le titre ne nomme
pas ») donne sa propre réponse : le badge « Numo » saute, puisque le titre commence
par le mot. L'icône Numo reste, dans le même emplacement d'icône que les autres
blocs. Vérifié sur les trois badges restants : `voiceBadge` et `scratchpadBadge`
nomment une fonctionnalité que leur titre tait → gardés ; `heroBadge` aussi → gardé.
La règle est maintenant tenue partout.

**`consistency.h2_punctuation` — tranché.** Aucun H2 ne porte de point final, sauf
`featuresTitle` : « Tout ce qu'il faut. Rien de plus. » est fait de deux phrases
coupées, retirer le second point en gardant le premier serait pire que l'exception.
J'ai donc retiré le point de `agentsTitle` — que le `proposed` de l'audit apportait
— pour qu'il reste **une** exception voulue au lieu de deux accidentelles.

**`consistency.feedback_ai_naming`** reste hors périmètre : les chaînes visées sont
in-app (`FeedbackBoard.*`, `Settings.*`, `Billing.segment*`) et le finding était
marqué `remove`, sans proposition. Sur la landing j'ai suivi la réponse 10 —
`feedbackNote` attribue la modération à **Numo** — ce qui diverge du board public
lui-même, qui dit « par l'IA ».

---

## Copy que j'ai écrite

L'audit ne fournissait pas de chaîne pour ces cinq-là. Chacune est contrainte par
un fait déjà vérifié ailleurs dans l'audit, mais aucune n'est verbatim — **à relire
en priorité** :

| clé | ce sur quoi je me suis appuyé |
|---|---|
| `speedShortcuts` | les 5 raccourcis cités par `structure.speed_section`, chacun corroboré par un autre finding |
| `agentsPlanNote` | dérivé de `Pricing.faq_mcp_a`, verbatim de l'audit |
| `moreSubtitle` (en) | le fr est verbatim ; l'audit ne donnait que le titre en anglais |
| `more_import_title` / `_body` | dérivé de `faq_migrate_a` |
| `more_i18n_title` / `_body` | i18n fr/en + thème clair/sombre, vérifiés dans les réglages |

**Clé supprimée sans que l'audit le demande** : `featuresCaptionPalette`. Elle
légendait la capture de la palette tant que celle-ci était une figure anonyme en
§2 ; en §3 la capture est collée à son propre titre et à `feature_palette_body`,
qui disent la même chose en mieux. Deux textes jumeaux à 20 px l'un de l'autre —
c'est la définition de `useless_info`. Dis-le si tu la veux de retour.

---

## Findings sans action

- **`section-feedback.missing.public-site`** — décision de l'audit : ne pas
  mentionner que le board forme un petit site. Action `remove`, aucune chaîne.
- **`structure.no_reassurance`** — aucune preuve sociale n'existe aujourd'hui, on
  n'invente rien. À rouvrir le jour où un chiffre réel existe.
- **`Pricing.faq_refund_a`** — confirmé exact par l'audit, inchangé (la ligne
  apparaît quand même dans le diff : elle a gagné une virgule de fin, les deux
  questions MCP et BYOK arrivant après elle).

`Landing.missing.statistics` et `Landing.missing.issue_structure` restent hors page
comme l'exigeait la note de `completeness_section` (« à ne PAS gonfler ») — c'est
précisément ce qui empêche §6 de devenir un catalogue.

---

## Autres points de vigilance

**`Landing.feedbackNote` fait maintenant trois phrases longues.** Deux findings
distincts demandaient chacun d'y ajouter du texte (`missing.private-and-my-feedback`
pour la modération par Numo, `missing.integration-wizard` pour le prompt
d'intégration) et les deux sont appliqués verbatim. Résultat : « par l'API »
apparaît deux fois. C'est le seul endroit du diff où j'aurais coupé si l'audit
m'y avait autorisé — à toi de tailler.

**Traductions non touchées** : aucune. L'audit fournissait `proposed_en` pour toutes
les chaînes réécrites, rien n'a été machine-traduit. Deux exceptions signalées, où
la correction était marquée FR-seule et où l'anglais garde donc sa formulation
d'origine, à vérifier si tu veux l'alignement :

- `en.Landing.numoExamplesTitle` = « What people actually ask it » (le FR est passé
  au vouvoiement)
- `en.Landing.feedbackCaptionBoard` = « Public side: people suggest… » (le FR dit
  maintenant « vos utilisateurs »)

**Ce qui reste à regarder à l'œil** — le rendu a été vérifié en 1280 px, pas en
mobile ni en thème sombre. Les trois points à surveiller : le bouton de nav allongé
(« Commencer gratuitement »), §4 qui est longue par construction (elle en fusionne
trois), et §3 dont les trois blocs doivent rester distincts sans H2 pour les
séparer.

---

## Relecture

```
git diff HEAD -- messages/ components/marketing/ "app/(marketing)/"
```

**`HEAD` est nécessaire, pas un `git diff` nu** : la phase 2 supprime quatre
composants et en renomme un, et `git rm` / `git mv` placent ces changements dans
l'index — un `git diff` sans référence ne les montrerait pas. Les deux nouveaux
composants (`section-speed.tsx`, `section-more.tsx`) ont été marqués `add -N` pour
qu'ils apparaissent eux aussi.

Rien n'a été commité. `app/(app)/inbox/page.tsx` dans le diff global est antérieur
à cette passe.
