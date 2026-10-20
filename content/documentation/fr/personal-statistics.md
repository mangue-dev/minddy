---
{
  "id": "personal-statistics",
  "locale": "fr",
  "title": "Statistiques personnelles",
  "summary": "Comparez l’activité terminée et les temps mesurés dans leur périmètre réel.",
  "topic": "Planifier et retrouver le travail",
  "type": "explanation",
  "audiences": [
    "member"
  ],
  "workflows": [
    "W18"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 7,
  "sourceRevision": 7,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-20",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5); MIN-737 account settings reorganization; UI/UX refinements batch: account settings open on Preferences",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "mobile",
      "desktop"
    ],
    "evidence": [
      "components/stats/profile-statistics.tsx",
      "components/settings/account-profile-section.tsx",
      "components/settings/account-settings-page.tsx",
      "components/stats/effort-durations.tsx",
      "content/documentation/reviews/min-737-settings-reorganization.md",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql",
      "supabase/migrations/20270109200067_stats_distinct_year.sql",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "app/(app)/statistics/page.tsx"
    ]
  },
  "review": {
    "revision": 7,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (12-month headline deduplication: get_user_stats migration 20270109200067, lib/stats-derive.ts and a production read of one account (685 events, 603 distinct issues); no browser walkthrough, no new captures; unchanged evidence retained); agent:/root (MIN-737 account settings reorganization: text revised from source review of components/settings/account-settings-page.tsx and components/stats/profile-statistics.tsx; figure personal-statistics-steps recaptured on 2026-10-19 in all six locales from the local candidate (now personal-statistics-workflow.png, demo history mirrored into the statistics ledger by captures/world/seed/018-statistiques.mjs) and inspected; the grid crops to the most recent weeks that fit; no other browser walkthrough); agent:/root (UI/UX refinements batch, account settings opening tab: source review of ACCOUNT_SETTINGS_DEFAULT_TAB in lib/settings-sections.ts, the profile entry in components/app-sidebar.tsx and the /statistics redirect to the Profile tab; no browser walkthrough, no new captures; unchanged evidence retained)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root (fr headline deduplication sentence and retained-meaning self-review; agent review, not human acceptance); agent:/root (fr MIN-737 changed passages with catalog UI labels; retained-meaning self-review; agent review, not human acceptance); agent:/root (fr translation of the account settings opening tab changed passage with catalog UI labels, equivalent meaning self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-20"
  },
  "related": [
    "personal-cycle",
    "objectives",
    "ai-settings-and-usage"
  ],
  "aliases": [],
  "tags": [
    "Lire vos statistiques personnelles"
  ],
  "figures": [
    {
      "id": "personal-statistics-steps",
      "kind": "screenshot",
      "src": "/documentation/fr/personal-statistics-workflow.png",
      "alt": "Statistiques du profil : bandeau de chiffres, grille d’activité sur 12 mois, répartitions par projet et par catégorie, rythme de travail.",
      "caption": "Historique réel du compte de démonstration : six tickets terminés dans deux projets, trente tickets créés, aucune tâche du carnet cochée.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-19",
      "viewport": [
        816,
        984
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "personal-statistics-steps"
  ]
}
---

## Ouvrir et lire les statistiques {#personal-statistics}

Vos statistiques se trouvent dans l’onglet **Profil** des paramètres du compte. Choisissez votre nom en haut du menu du compte pour l’ouvrir directement. **Paramètres du compte** s’ouvre sur **Préférences** ; de là, sélectionnez **Profil**, le premier onglet. Les statistiques apparaissent sous votre avatar, votre nom et votre adresse email. L’ancienne adresse `/statistics` ouvre désormais cet onglet.

Une bande de six chiffres vient d’abord : **Terminés**, **Tâches cochées**, **Créés**, **Projets**, **Plus longue série** et **Série en cours**. Elle remplace l’ancienne section des totaux historiques. En dessous, lisez le chiffre des 12 mois et la grille d’activité, puis **Où est passé votre travail ?**, avec les répartitions par projet, catégorie et objectif, et **Rythme de travail**, avec **Charge actuelle**, **Tickets par cycle**, **Écart à l'échéance** et **Répartition par effort**. **Tickets par cycle**, **Écart à l'échéance** et **Répartition par effort** n’apparaissent que lorsqu’ils ont des données. L’onglet affiche ses périodes prévues ; il n’a pas de filtre de dates pour choisir un autre intervalle. Cet écran résume votre travail ; il n’établit pas un classement des performances d’un autre membre.

Consultez tickets terminés, rythme, jours actifs, séries et temps pour examiner votre activité. La grille d’activité compte les événements de réalisation de tickets et de tâches du carnet, regroupés en jours calendaires dans votre fuseau. La grille ne défile jamais : elle montre les semaines les plus récentes qui tiennent à l’écran, si bien qu’un téléphone affiche moins de mois qu’un ordinateur. Un jour actif contient au moins un de ces événements ; la série courante tolère l’absence d’activité aujourd’hui, puis s’arrête au premier jour sans activité dans les jours précédents. Le chiffre **Terminés** déduplique les identifiants : un ticket repassé en Terminé n’est compté qu’une fois, si bien qu’un compte d’événements et un total de tickets distincts ne répondent pas à la même question. Le chiffre affiché au-dessus de la grille compte lui aussi chaque ticket une seule fois sur ses 12 mois : un ticket terminé à nouveau marque chacun de ses jours dans la grille, mais n’ajoute qu’un ticket au chiffre.

Le temps par effort est la médiane du temps écoulé entre le premier passage enregistré d’un ticket en cours et sa réalisation, pour les tickets terminés qui vous sont attribués et possèdent effort et horodatages nécessaires. Il comprend le temps d’attente écoulé ; ce n’est pas un chronomètre d’heures travaillées. La vue **Nombre de tickets** montre la taille de l’échantillon. Une médiane absente peut indiquer l’absence de mesures admissibles, pas une durée nulle. Lisez les unités et la période décrite par chaque section avant de comparer les valeurs.

## Interpréter des données limitées ou modifiées {#statistics-limits}

Une période vide peut refléter l’absence de travail terminé correspondant ou une activité insuffisante. Elle ne prouve pas l’absence de tickets. Des changements d’effort, de périmètre ou de type de travail peuvent modifier la comparaison sans prouver un gain ou une perte de vitesse.

Numo peut lire ces nombres avec ses outils de statistiques en lecture seule. Son accès à la consommation ou aux exécutions récentes est aussi en lecture seule ; les afficher ne change pas votre budget. Pour un problème de coût IA, ouvrez consommation et réglages plutôt que de modifier l’effort d’un ticket pour masquer la mesure.


![Statistiques du profil : bandeau de chiffres, grille d’activité sur 12 mois, répartitions par projet et par catégorie, rythme de travail.](/documentation/fr/personal-statistics-workflow.png)
