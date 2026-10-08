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
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
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
      "app/(app)/statistics/page.tsx",
      "components/stats/effort-durations.tsx",
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
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
      "src": "/documentation/fr/reader-statistics.png",
      "alt": "Statistiques personnelles avec grille annuelle, répartitions, rythme de travail et totaux depuis le début.",
      "caption": "Ce compte de démonstration compte un ticket terminé et onze tickets créés. Les statistiques affichées sont réelles ; les noms du projet et de l’objectif ont été localisés pour l’illustration.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1892,
        1996
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "personal-statistics-steps"
  ]
}
---

## Ouvrir et lire les statistiques {#personal-statistics}

Ouvrez les statistiques depuis la navigation du compte. Lisez la grille d’activité annuelle, les répartitions par projet, catégorie et objectif, la section du rythme et les totaux historiques. L’écran affiche ses périodes prévues ; il n’a pas de filtre de dates pour choisir un autre intervalle. Cet écran résume votre travail ; il n’établit pas un classement des performances d’un autre membre.

Consultez tickets terminés, rythme, jours actifs, séries et temps pour examiner votre activité. La grille d’activité compte les événements de réalisation de tickets et de tâches du carnet, regroupés en jours calendaires dans votre fuseau. Un jour actif contient au moins un de ces événements ; la série courante tolère l’absence d’activité aujourd’hui, puis s’arrête au premier jour sans activité dans les jours précédents. Le total historique des tickets terminés déduplique les identifiants : un compte d’événements et un total de tickets distincts ne répondent pas à la même question.

Le temps par effort est la médiane du temps écoulé entre le premier passage enregistré d’un ticket en cours et sa réalisation, pour les tickets terminés qui vous sont attribués et possèdent effort et horodatages nécessaires. Il comprend le temps d’attente écoulé ; ce n’est pas un chronomètre d’heures travaillées. La vue des quantités montre la taille de l’échantillon. Une médiane absente peut indiquer l’absence de mesures admissibles, pas une durée nulle. Lisez les unités et la période décrite par chaque section avant de comparer les valeurs.

## Interpréter des données limitées ou modifiées {#statistics-limits}

Une période vide peut refléter l’absence de travail terminé correspondant ou une activité insuffisante. Elle ne prouve pas l’absence de tickets. Des changements d’effort, de périmètre ou de type de travail peuvent modifier la comparaison sans prouver un gain ou une perte de vitesse.

Numo peut lire ces nombres avec ses outils de statistiques en lecture seule. Son accès à la consommation ou aux exécutions récentes est aussi en lecture seule ; les afficher ne change pas votre budget. Pour un problème de coût IA, ouvrez consommation et réglages plutôt que de modifier l’effort d’un ticket pour masquer la mesure.


![Statistiques personnelles avec grille annuelle, répartitions, rythme de travail et totaux depuis le début.](/documentation/fr/reader-statistics.png)
