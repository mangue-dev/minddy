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
  "revision": 9,
  "sourceRevision": 9,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-22",
  "compatibility": {
    "version": "0.20.0 (MIN-747 release review)",
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
      "content/knowledge/productivity.md",
      "lib/stats-derive.ts",
      "lib/server/stats.ts",
      "supabase/migrations/20270107070000_history_encryption.sql",
      "supabase/migrations/20270107720000_project_content_encryption.sql",
      "supabase/migrations/20270109200067_stats_distinct_year.sql",
      "lib/settings-sections.ts",
      "components/app-sidebar.tsx",
      "app/(app)/statistics/page.tsx",
      "components/stats/stats-hero.tsx"
    ]
  },
  "review": {
    "revision": 9,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 9,
      "reviewed": true,
      "capturedAt": "2026-10-20",
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

Consultez tickets terminés, rythme, jours actifs, séries et temps pour examiner votre activité. La grille d’activité compte les événements de réalisation de tickets et de tâches du carnet, regroupés en jours calendaires dans votre fuseau. La grille ne défile jamais : elle montre les semaines les plus récentes qui tiennent à l’écran, si bien qu’un téléphone affiche moins de mois qu’un ordinateur. Un jour actif contient au moins un de ces événements ; la série courante tolère l’absence d’activité aujourd’hui, puis s’arrête au premier jour sans activité dans les jours précédents. Le chiffre **Terminés** déduplique les identifiants : un ticket repassé en Terminé n’est compté qu’une fois, si bien qu’un compte d’événements et un total de tickets distincts ne répondent pas à la même question. Le chiffre affiché au-dessus de la grille additionne les tickets et les tâches du carnet terminés sur les 12 derniers mois ; pointez ce nombre pour voir sa répartition en tickets, tâches et jours actifs. Il compte lui aussi chaque ticket une seule fois sur ces 12 mois : un ticket terminé à nouveau marque chacun de ses jours dans la grille, mais n’ajoute qu’un ticket au chiffre.

Le temps par effort est la médiane du temps écoulé entre le premier passage enregistré d’un ticket en cours et sa réalisation, pour les tickets terminés qui vous sont attribués et possèdent effort et horodatages nécessaires. Il comprend le temps d’attente écoulé ; ce n’est pas un chronomètre d’heures travaillées. La vue **Nombre de tickets** montre la taille de l’échantillon. Une médiane absente peut indiquer l’absence de mesures admissibles, pas une durée nulle. Lisez les unités et la période décrite par chaque section avant de comparer les valeurs.

## Interpréter des données limitées ou modifiées {#statistics-limits}

Un compte qui n’a encore créé ni terminé aucun ticket, ni coché aucune tâche du carnet, voit **Rien à mesurer pour l'instant** à la place des chiffres, avec un bouton **Nouveau ticket**, ou **Créer le premier projet** s’il n’a aucun projet où créer un ticket. Une période vide peut refléter l’absence de travail terminé correspondant ou une activité insuffisante. Elle ne prouve pas l’absence de tickets. Des changements d’effort, de périmètre ou de type de travail peuvent modifier la comparaison sans prouver un gain ou une perte de vitesse.

Numo peut lire ces nombres avec ses outils de statistiques en lecture seule. Son accès à la consommation ou aux exécutions récentes est aussi en lecture seule ; les afficher ne change pas votre budget. Pour un problème de coût IA, ouvrez consommation et réglages plutôt que de modifier l’effort d’un ticket pour masquer la mesure.


![Statistiques du profil : bandeau de chiffres, grille d’activité sur 12 mois, répartitions par projet et par catégorie, rythme de travail.](/documentation/fr/personal-statistics-workflow.png)
