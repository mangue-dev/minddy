---
{
  "id": "scheduled-routines",
  "locale": "fr",
  "title": "Routines",
  "summary": "Déclenchez Numo par planning, événement de ticket, retour reçu ou nouvelle entrée de base.",
  "topic": "Numo et intégrations",
  "type": "guide",
  "audiences": [
    "owner"
  ],
  "workflows": [
    "N06"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-12",
  "compatibility": {
    "version": "0.11.1 candidate (MIN-677)",
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "content/documentation/reviews/routine-localized-capture-candidates.json",
      "content/documentation/reviews/visual-refresh-captures-2026-10-09.json",
      "content/documentation/reviews/min-677-routines.md",
      "content/documentation/reviews/min-677-editor-captures.json"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root (MIN-677 source review and single-group editor keyboard/mobile follow-up; unchanged procedures retain prior evidence)",
    "language": "agent:/root (fr translation, label and retained-meaning self-review)",
    "date": "2026-10-12"
  },
  "related": [],
  "aliases": [],
  "tags": [
    "Planifier et suivre une routine Numo"
  ],
  "figures": [
    {
      "id": "scheduled-routines-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/scheduled-routines-workflow.png",
      "alt": "Modes « Programmé » et « Événement », un seul groupe de conditions, icônes de l’application et boutons d’information discrets.",
      "caption": "Démonstration locale du véritable éditeur de déclencheurs. Aucune routine n’a été enregistrée ou exécutée.",
      "revision": 6,
      "reviewed": true,
      "capturedAt": "2026-10-12",
      "viewport": [
        788,
        910
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "scheduled-routines-workflow"
  ]
}
---

## Créer une routine {#scheduled-routines}

Seul le propriétaire du projet peut créer, modifier ou activer une routine. Ouvrez Routines, choisissez un projet dont vous êtes propriétaire et rédigez les instructions pour Numo. Mentionnez les tickets, pages ou objectifs utiles. Chaque occurrence possède une conversation Numo privée, un historique, les outils Minddy et une délégation de code facultative. Les workers utilisent les réglages du compte du propriétaire ; un dépôt n’est nécessaire que pour travailler sur son code.

Choisissez **Programmé** ou **Événement**. L’arrivée dans une base est un choix de la liste des événements.

- **Programmé :** choisissez une fréquence quotidienne, hebdomadaire ou mensuelle, une heure et votre fuseau. Vérifiez l’aperçu de la première exécution.
- **Événement :** choisissez la création d’un ticket, son entrée dans un statut cible, une affectation, un commentaire sur un ticket suivi, la réception d’un retour ou une nouvelle entrée dans une base. Sélectionnez le statut, la personne ou le ticket demandé. Le déclencheur de statut inclut les tickets créés directement dans ce statut. Une affectation exige un changement réel de personne assignée.

Pour une arrivée dans une base, choisissez **Nouvelle entrée de base de données** dans la liste des événements, puis une base de pages de ce projet. Une création, duplication, import de base ou déplacement vers cette base compte comme une arrivée. Restaurer une entrée ne crée pas une nouvelle arrivée.

Les **Conditions** sont facultatives : sans filtre, chaque événement correspondant peut lancer la routine. Réglez le délai séparément dans **Délai de lancement**. Les petits boutons d’information expliquent le comportement d’attente et le délai. Les sélecteurs reprennent les indicateurs de statut, de priorité, de catégorie et de personne de Minddy. Utilisez les flèches et Entrée ; les listes longues disposent d’une recherche.

Réglez si nécessaire le délai après l’événement, de 0 à 120 minutes. Conservez votre fuseau pour le contexte de Numo. Les routines d’événement et de base écoutent les prochaines arrivées sans date planifiée. Le traitement automatique nécessite le scheduler de l’instance ; une exécution manuelle reste possible.

## Construire des conditions qui peuvent attendre {#conditions}

Utilisez **Ajouter une condition** pour construire un seul groupe de 16 conditions maximum. Choisissez **Toutes les conditions** (ET) ou **Au moins une condition** (OU) pour tout le groupe. Sélectionnez le statut, la personne assignée, la catégorie, la priorité ou l’effort ; pour une base, choisissez sa propriété typée. Sélectionnez un opérateur compatible et une valeur. Les personnes, catégories et bases doivent appartenir à ce projet. Aucun groupe imbriqué ne peut être ajouté. Les anciennes règles imbriquées conservent leur logique ; si elles ne peuvent pas être affichées dans un seul groupe équivalent, **Remplacer les conditions** les efface pour créer un nouveau groupe.

Exemple : entrée en Triage, avec toutes les conditions exigeant la catégorie Backend et la priorité Haute. Un ticket arrivant sans catégorie reste en attente. Ajouter Backend ensuite peut lancer l’occurrence. Une fois utilisée, cette attente ne peut pas lancer une seconde occurrence. Sortir du statut cible l’annule ; y entrer de nouveau crée une nouvelle attente. Une réaffectation remplace également l’attente précédente.

Une entrée créée sans sa propriété requise attend qu’une modification satisfasse le filtre. Supprimer une propriété référencée ou changer son type affiche une erreur de filtre : corrigez les conditions de la routine avant de poursuivre. Le délai reste respecté lorsqu’un filtre devient vrai. La réception d’un retour inclut les retours privés et en attente ; Numo ne les publie pas et ne contourne pas leur modération.

![Modes « Programmé » et « Événement », un seul groupe de conditions, icônes de l’application et boutons d’information discrets.](/documentation/fr/scheduled-routines-workflow.png)

## Gérer et vérifier les exécutions {#runs}

Ouvrez la routine pour consulter ses attentes, modifier ses instructions ou son déclencheur, la mettre en pause ou lire ses occurrences. La pause, la suppression ou une modification de configuration invalide les attentes. La réactivation écoute les futurs événements sans rejouer les anciennes arrivées. Une exécution manuelle peut lancer chaque type de routine sans attendre son événement et consomme également du budget.

Chaque occurrence utilise le budget IA du propriétaire, avec un plafond par défaut de 15 % du budget mensuel, Numo et workers compris. Ouvrez sa conversation pour lire la source, le résultat, les vérifications, questions et travaux délégués. Si Numo demande votre avis, répondez dans cette conversation ; le budget restant de l’occurrence est conservé. Consultez les résultats enregistrés avant de modifier un plafond ou de réessayer. Après un changement de propriétaire, la routine de l’ancien propriétaire ne peut plus démarrer de travail ; créez-en une avec le compte du propriétaire actuel.

Les anciennes automatisations du projet apparaissent comme propositions en pause lorsque leur propriétaire ouvre Routines. Lisez le [guide de transition](/docs/automation-settings) avant de les activer.

Ce plafond s’applique lorsqu’un budget mensuel inclus est disponible ; un mode sans plafond utilisant une clé personnelle ne reçoit pas de budget mensuel artificiel.
