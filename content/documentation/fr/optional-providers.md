---
{
  "id": "optional-providers",
  "locale": "fr",
  "title": "Activer volontairement les fournisseurs optionnels",
  "summary": "Le cœur n’exige ni Stripe, ni PostHog, ni compte Cloud, ni clé IA gérée par Minddy.",
  "topic": "Exploiter une instance",
  "type": "guide",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H09"
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
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "docs/editions.md",
      ".env.example",
      "lib/capabilities.ts",
      "content/knowledge/self-hosting.md"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "authentication-and-email",
    "architecture-and-data-flows",
    "instance-configuration"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "optional-providers-flow",
      "kind": "diagram",
      "src": "/documentation/fr/optional-providers-flow.svg",
      "alt": "Schéma: L’opérateur choisit une capacité optionnelle. Identifiants complets et conditions fournisseur. Destination externe explicitement choisie. Vérifier le comportement et suivre les coûts.",
      "caption": "Ces composants ont des responsabilités distinctes. L’opérateur choisit une capacité optionnelle. Identifiants complets et conditions fournisseur. Destination externe explicitement choisie. Vérifier le comportement et suivre les coûts.",
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
    "optional-providers-flow"
  ]
}
---

## Activer volontairement les fournisseurs optionnels {#optional-providers}

Le cœur n’exige ni Stripe, ni PostHog, ni compte Cloud, ni clé IA gérée par Minddy. Les services externes ajoutent coûts, permissions et destinations des données. Examinez leurs conditions avant activation. Les diagnostics signalent les valeurs manquantes au lieu de choisir un fournisseur de secours. Une instance self-hosted peut employer des clés IA personnelles ou des endpoints locaux accessibles. Laissez MINDDY_MANAGED_AI et MINDDY_MANAGED_BILLING désactivés ; une clé OpenRouter seule ne sélectionne pas Cloud.


![Schéma: L’opérateur choisit une capacité optionnelle. Identifiants complets et conditions fournisseur. Destination externe explicitement choisie. Vérifier le comportement et suivre les coûts.](/documentation/fr/optional-providers-flow.svg)

## Renseigner les fournisseurs {#configure}

L’email applicatif exige EMAIL_PROVIDER=resend, RESEND_API_KEY, FEEDBACK_EMAIL_FROM et INVITATION_EMAIL_FROM. console est refusé en production ; SMTP Auth reste séparé. Web Push exige les clés VAPID publique et privée et VAPID_SUBJECT ; les abonnements existants dépendent de cette paire. L’analytique exige une paire clé/hôte PostHog complète ; le suivi d’erreurs ajoute MINDDY_PUBLIC_ERROR_TRACKING=1. L’assistant d’installation propose application-email et web-push, à vous de fournir les identifiants externes. N’employez pas les identités d’expéditeur Minddy ni ses identifiants de release native sur une autre instance.

## Connecter Git et l’exécution de code {#git-and-code}

GitHub.com et GitLab.com sont pris en charge, contrairement à Enterprise Server et GitLab autogéré. Les connexions lancées par l’utilisateur peuvent utiliser le relais forge géré ; refusez-le avec --no-forge-relay ou MINDDY_FORGE_RELAY=0 puis configurez vos propres applications. Les connexions existantes gardent leur canal jusqu’à reconnexion. Le serveur de référence inclut un runner Docker self-hosted de confiance. Vercel Sandbox est une alternative explicite avec ses identifiants et MINDDY_DATA_ROOT_KEY valide, même sans chiffrement du contenu. L’exécution desktop locale est retirée. Une configuration absente bloque la délégation au lieu d’exécuter du code sur l’ordinateur de l’utilisateur.

L’image publiée de l’application inclut Node.js et Git, mais retire volontairement npm, npx et Corepack. Le profil Compose de référence choisit aussi cette image pour les workers via AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Cela ne suffit pas pour un nouveau worker de code : le bootstrap OpenCode utilise npm pour installer son runtime et son plugin épinglés, même dans un dépôt sans dépendances de projet. Sans npm, l’exécution s’arrête au bootstrap ; la conversation ne permet pas de conclure qu’un fichier du projet a été modifié ou qu’un test a réussi. Utilisez une image dédiée aux workers, construite et vérifiée par l’opérateur, avec Node.js 24, npm, Git et les outils nécessaires au projet, en surchargeant AGENT_RUNNER_SANDBOX_IMAGE dans le service runner. Conservez les contraintes d’isolation du runner. Vérifiez le bootstrap, le clonage, les véritables tests et le diff obtenu avant d’autoriser la délégation de code. Corriger les fichiers du runner ne fournit pas cette chaîne d’outils au worker.
