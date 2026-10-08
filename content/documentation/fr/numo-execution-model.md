---
{
  "id": "numo-execution-model",
  "locale": "fr",
  "title": "Comprendre les tours durables Numo et le travail délégué",
  "summary": "Messages interactifs, actions contextuelles et routines entrent dans les conversations Numo.",
  "topic": "Concepts techniques",
  "type": "explanation",
  "audiences": [
    "integrator",
    "operator"
  ],
  "workflows": [
    "T05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "web",
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "docs/architecture/numo-persistence.md",
      "docs/architecture/numo-durable-turns.md",
      "content/knowledge/agents-and-mcp.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "mcp-tool-reference",
    "architecture-and-data-flows",
    "integration-troubleshooting"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "numo-execution-model-flow",
      "kind": "diagram",
      "src": "/documentation/fr/numo-execution-model-flow.svg",
      "alt": "Schéma: Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre le worker courant si nécessaire. Relire les événements ; réconcilier les écritures.",
      "caption": "Lisez les étapes dans cet ordre. Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre le worker courant si nécessaire. Relire les événements ; réconcilier les écritures.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "numo-execution-model-flow"
  ]
}
---

## Comprendre les tours durables Numo et le travail délégué {#numo-execution-model}

Messages interactifs, actions contextuelles et routines entrent dans les conversations Numo. Modèle et raisonnement conversationnels se choisissent dans le composeur ; le travail sur le code délégué utilise les valeurs par défaut du modèle de code et du niveau de raisonnement du compte. Les outils Minddy directs peuvent agir sans dépôt. Le code ouvre une sandbox serveur pour le dépôt lié uniquement si nécessaire. Une routine crée une nouvelle conversation avec instruction enregistrée et contexte propriétaire/projet. Il n’est pas nécessaire de garder une session de l’application de bureau ouverte.


![Schéma: Persister intention, message et UUID. Prendre le tour, enregistrer outils et résultats. Attendre le worker courant si nécessaire. Relire les événements ; réconcilier les écritures.](/documentation/fr/numo-execution-model-flow.svg)

## Distinguer exécution et affichage {#state}

L’intention est enregistrée comme tour durable avec UUID de requête et message. L’état passe de queued à running, puis completed, waiting_input ou waiting_work ; stopping/stopped et retryable/failed décrivent arrêt et échec. SSE affiche l’activité persistée sans posséder l’exécution. La reconnexion lit messages et événements après sa séquence. La fin d’un worker relance uniquement le parent attendant l’exécution courante ; événements dupliqués ou anciens ne créent aucune deuxième tâche. Le contexte projet est distinct de l’accès : un chat privé reste privé.

## Traiter les mutations incertaines {#mutations}

Avant mutation, le système enregistre opération et checkpoint. Les résultats terminés sont réutilisés. Une lecture interrompue peut être répétée ; une mutation dont le résultat est inconnu entre en reconciling sans répétition automatique. Inspectez la destination avant de répéter une écriture externe. Connexions et budget des routines restent soumis au propriétaire et aux protections de coût ; un autre membre ne peut emprunter les identifiants MCP personnels antérieurs. Arrêter le parent interrompt le travail délégué actif, mais une action externe déjà envoyée peut encore aboutir.
