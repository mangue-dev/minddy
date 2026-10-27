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
  "revision": 11,
  "sourceRevision": 11,
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
      "content/knowledge/productivity.md",
      "components/routines/create-routine-wizard.tsx",
      "components/routines/routine-detail.tsx",
      "components/routines/routines-panel.tsx",
      "components/routines/use-routine-actions.tsx",
      "docs/security/project-roles.md",
      "lib/project-roles.ts"
    ]
  },
  "review": {
    "revision": 11,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 1 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "revision": 11,
      "reviewed": true,
      "capturedAt": "2026-10-22",
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

Seul le propriétaire du projet peut créer, modifier ou activer une routine. Ouvrez Routines, choisissez un projet dont vous êtes propriétaire et rédigez les instructions pour Numo. Mentionnez les tickets, pages ou objectifs utiles. Chaque occurrence possède une conversation Numo privée, un historique et les outils Minddy. Les routines organisent et suivent le travail, par exemple un tri hebdomadaire, une revue des tickets inactifs ou un résumé hebdomadaire ; elles ne modifient pas le code du dépôt.

Choisissez **Programmé** ou **Événement**. L’arrivée dans une base est un choix de la liste des événements.

- **Programmé :** choisissez une fréquence quotidienne, hebdomadaire ou mensuelle, une heure et votre fuseau. Vérifiez l’aperçu de la première exécution.
- **Événement :** choisissez la création d’un ticket, son entrée dans un statut cible, une affectation, un commentaire sur un ticket suivi, la réception d’un retour ou une nouvelle entrée dans une base. Sélectionnez le statut, la personne ou le ticket demandé. Le déclencheur de statut inclut les tickets créés directement dans ce statut. Une affectation exige un changement réel de personne assignée. Un commentaire écrit par un lecteur ne déclenche pas de routine de commentaire.

Pour une arrivée dans une base, choisissez **Nouvelle entrée de base de données** dans la liste des événements, puis une base de pages de ce projet. Une création, duplication, import de base ou déplacement vers cette base compte comme une arrivée. Restaurer une entrée ne crée pas une nouvelle arrivée.

Les **Conditions** sont facultatives : sans filtre, chaque événement correspondant peut lancer la routine. Réglez le délai séparément dans **Délai de lancement**. Les petits boutons d’information expliquent le comportement d’attente et le délai. Les sélecteurs reprennent les indicateurs de statut, de priorité, de catégorie et de personne de Minddy. Utilisez les flèches et Entrée ; les listes longues disposent d’une recherche.

Réglez si nécessaire le délai après l’événement, de 0 à 120 minutes. Conservez votre fuseau pour le contexte de Numo. Les routines d’événement et de base écoutent les prochaines arrivées sans date planifiée. Le traitement automatique nécessite le scheduler de l’instance ; une exécution manuelle reste possible.

## Construire des conditions qui peuvent attendre {#conditions}

Utilisez **Ajouter une condition** pour construire un seul groupe de 16 conditions maximum. Choisissez **Toutes les conditions** (ET) ou **Au moins une condition** (OU) pour tout le groupe. Sélectionnez le statut, la personne assignée, la catégorie, la priorité ou l’effort ; pour une base, choisissez sa propriété typée. Sélectionnez un opérateur compatible et une valeur. Les personnes, catégories et bases doivent appartenir à ce projet. Aucun groupe imbriqué ne peut être ajouté. Les anciennes règles imbriquées conservent leur logique ; si elles ne peuvent pas être affichées dans un seul groupe équivalent, **Remplacer les conditions** les efface pour créer un nouveau groupe.

Exemple : entrée en Triage, avec toutes les conditions exigeant la catégorie Backend et la priorité Haute. Un ticket arrivant sans catégorie reste en attente. Ajouter Backend ensuite peut lancer l’occurrence. Une fois utilisée, cette attente ne peut pas lancer une seconde occurrence. Sortir du statut cible l’annule ; y entrer de nouveau crée une nouvelle attente. Une réaffectation remplace également l’attente précédente.

Une entrée créée sans sa propriété requise attend qu’une modification satisfasse le filtre. Supprimer une propriété référencée ou changer son type affiche une erreur de filtre : corrigez les conditions de la routine avant de poursuivre. Le délai reste respecté lorsqu’un filtre devient vrai. La réception d’un retour inclut les retours privés et en attente ; Numo ne les publie pas et ne contourne pas leur modération.

![Modes « Programmé » et « Événement », un seul groupe de conditions, icônes de l’application et boutons d’information discrets.](/documentation/fr/scheduled-routines-workflow.png)

## Gérer et vérifier les exécutions {#runs}

Ouvrez la routine pour consulter ses attentes, modifier ses instructions ou son déclencheur, la mettre en pause ou lire ses occurrences. Sur sa page, le propriétaire écrit l’instruction directement (elle est enregistrée quand vous la quittez), déplie **Déclencheur** pour le modifier, choisit le **Plafond de dépense** et passe de **Active** à **En pause** depuis le badge d’état en haut. La pause, la suppression ou une modification de configuration invalide les attentes. La réactivation écoute les futurs événements sans rejouer les anciennes arrivées. Une exécution manuelle peut lancer chaque type de routine sans attendre son événement et consomme également du budget.

Faites un clic droit sur une routine de la liste pour ouvrir sa dernière exécution sans la sélectionner d’abord ; **Ouvrir la dernière exécution** reste indisponible si la routine n’a jamais été exécutée. Le propriétaire du projet peut aussi choisir **Lancer maintenant**, **Mettre en pause** ou **Réactiver**, **Modifier** ou **Déplacer vers la corbeille** depuis le même menu. **Réactiver** est indisponible lorsque l’instance ne peut pas planifier de routines. Les autres membres ne voient que les entrées qui ne modifient pas la routine. Pour créer une routine, faites un clic droit sur **Routines** dans la barre latérale et choisissez **Nouvelle routine**.

Chaque occurrence utilise le budget IA du propriétaire, avec un plafond par défaut de 15 % du budget mensuel, qui inclut chaque appel à Numo de cette occurrence. Ouvrez sa conversation pour lire la source, le résultat et les questions. Si Numo demande votre avis, répondez dans cette conversation ; le budget restant de l’occurrence est conservé. Consultez les résultats enregistrés avant de modifier un plafond ou de réessayer. Lorsque la propriété est [transférée](/docs/projects#transfer-ownership), les routines de l’ancien propriétaire dans le projet sont mises en pause et ne peuvent plus démarrer de travail ; le nouveau propriétaire crée les routines qui doivent continuer.

Les automatisations de projet des versions précédentes ne s’exécutent plus et ne sont pas converties en routines. Lisez le [guide de transition](/docs/automation-settings) pour recréer un workflow sous forme de routine.

Ce plafond s’applique lorsqu’un budget mensuel inclus est disponible ; un mode sans plafond utilisant une clé personnelle ne reçoit pas de budget mensuel artificiel.
