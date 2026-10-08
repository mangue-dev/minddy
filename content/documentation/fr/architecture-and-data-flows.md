---
{
  "id": "architecture-and-data-flows",
  "locale": "fr",
  "title": "Suivre les flux entre application, base et fournisseurs",
  "summary": "L’application Next.js sert l’interface et les APIs autorisées.",
  "topic": "Concepts techniques",
  "type": "explanation",
  "audiences": [
    "operator",
    "integrator"
  ],
  "workflows": [
    "T03"
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
      "docs/editions.md",
      "docs/self-hosting-distribution.md",
      "lib/server/capabilities.ts"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "optional-providers",
    "storage-and-attachments",
    "numo-execution-model"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "architecture-and-data-flows-flow",
      "kind": "diagram",
      "src": "/documentation/fr/architecture-and-data-flows-flow.svg",
      "alt": "Schéma: Navigateur et application authentifiée. Supabase : PostgreSQL, Auth, Storage, Realtime. Planificateur indépendant et runner de confiance. Fournisseurs optionnels : destinations séparées.",
      "caption": "Ces composants ont des responsabilités distinctes. Navigateur et application authentifiée. Supabase : PostgreSQL, Auth, Storage, Realtime. Planificateur indépendant et runner de confiance. Fournisseurs optionnels : destinations séparées.",
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
    "architecture-and-data-flows-flow"
  ]
}
---

## Suivre les flux entre application, base et fournisseurs {#architecture-and-data-flows}

L’application Next.js sert l’interface et les APIs autorisées. Supabase fournit PostgreSQL, Auth, Storage et Realtime. PostgreSQL conserve enregistrements applicatifs, état des comptes et de la plateforme et métadonnées Storage ; le backend Storage conserve les octets. La configuration serveur protégée contient clés et identifiants fournisseurs. Les conteneurs applicatifs peuvent être recréés ; volumes de base, Storage brut et clés correspondantes doivent persister. La restauration complète les réunit.


![Schéma: Navigateur et application authentifiée. Supabase : PostgreSQL, Auth, Storage, Realtime. Planificateur indépendant et runner de confiance. Fournisseurs optionnels : destinations séparées.](/documentation/fr/architecture-and-data-flows-flow.svg)

## Suivre une requête {#requests}

Le navigateur utilise les origines publiques de l’application et de Supabase. Auth établit la session ; les endpoints serveur vérifient acteur et objet avant lecture ou modification. Realtime projette les mises à jour vers les sessions connectées. En full, les appels serveur passent par Kong interne sans changer les origines navigateur ni l’identité des liens de compte. Le planificateur appelle les jobs HTTP authentifiés indépendamment du navigateur. Le runner de confiance ouvre des sandboxes restreintes seulement quand Numo a besoin de code ; elles ne reçoivent ni secrets d’instance ni socket Docker.

## Identifier les destinations externes {#providers}

Modèles IA, email, Git, MCP distant, push, analytique et stockage externe sont des destinations séparées quand activées. Héberger l’application ne les rend pas locaux. Supabase géré exploite votre backend choisi ; le profil full place la pile épinglée sous votre contrôle. Cloud exploite le service et ses fournisseurs ; en self-hosted, vous fournissez comptes et choix. Examinez permissions, coûts et conditions des données de chaque intégration. N’inférez jamais un fournisseur ni l’édition Cloud d’un nom d’hôte ou d’une plateforme.
