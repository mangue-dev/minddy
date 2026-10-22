---
{
  "id": "architecture-and-data-flows",
  "locale": "fr",
  "title": "Architecture et flux de données",
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
  "revision": 7,
  "sourceRevision": 7,
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
    "revision": 7,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "instance-configuration",
    "storage-and-attachments",
    "numo"
  ],
  "aliases": [],
  "tags": [
    "Suivre les flux entre application, base et fournisseurs"
  ],
  "figures": [
    {
      "id": "architecture-and-data-flows-flow",
      "kind": "diagram",
      "src": "/documentation/fr/architecture-and-data-flows-flow.svg",
      "alt": "Schéma: Navigateur et application authentifiée. Supabase : PostgreSQL, Auth, Storage, Realtime. Planificateur indépendant des tâches de fond. Fournisseurs optionnels : destinations séparées.",
      "caption": "L’application coordonne l’accès aux données persistantes et le travail en arrière-plan, avec des destinations distinctes pour les intégrations externes.",
      "revision": 7,
      "reviewed": true,
      "capturedAt": "2026-10-16",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral",
      "diagram": {
        "layout": "collection",
        "items": [
          {
            "title": "Navigateur et application authentifiée"
          },
          {
            "title": "Supabase : PostgreSQL, Auth, Storage, Realtime"
          },
          {
            "title": "Planificateur indépendant des tâches de fond"
          },
          {
            "title": "Fournisseurs optionnels : destinations séparées"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "architecture-and-data-flows-flow"
  ]
}
---

## Suivre les flux entre application, base et fournisseurs {#architecture-and-data-flows}

L’application `Next.js` sert l’interface et les API autorisées. Supabase fournit PostgreSQL, Auth, Storage et Realtime. PostgreSQL conserve les enregistrements applicatifs, l’état des comptes et de la plateforme ainsi que les métadonnées Storage. Le backend Storage conserve les octets des fichiers. La configuration serveur protégée contient les clés et les identifiants des fournisseurs. Les conteneurs applicatifs peuvent être recréés, mais les volumes de la base, les fichiers Storage et les clés correspondantes doivent être conservés ensemble pour permettre une restauration complète.


![Schéma: Navigateur et application authentifiée. Supabase : PostgreSQL, Auth, Storage, Realtime. Planificateur indépendant des tâches de fond. Fournisseurs optionnels : destinations séparées.](/documentation/fr/architecture-and-data-flows-flow.svg)

## Suivre une requête {#requests}

Le navigateur utilise les origines publiques de l’application et de Supabase. Auth établit la session ; les points d’accès serveur vérifient l’identité de l’utilisateur et son accès à l’objet avant toute lecture ou modification. Realtime transmet les mises à jour aux sessions connectées. Dans le profil full, les appels serveur passent par Kong en interne, sans changer les origines du navigateur ni l’identité des liens de compte. Le planificateur appelle les tâches HTTP authentifiées indépendamment du navigateur.

## Identifier les destinations externes {#providers}

Les modèles IA, les e-mails, Git, les serveurs MCP distants, les notifications push, les statistiques d’usage et le stockage externe ont leurs propres destinations lorsqu’ils sont activés. Héberger l’application ne rend pas ces services locaux. Avec Supabase géré, le fournisseur exploite le backend choisi ; le profil full place la pile épinglée sous votre contrôle. En Cloud, minddy exploite le service avec ses fournisseurs. En auto-hébergement, vous choisissez les services et fournissez les comptes nécessaires. Examinez les permissions, les coûts et les conditions de traitement des données de chaque intégration. Ne déduisez jamais un fournisseur ou l’édition Cloud d’un nom d’hôte ou d’une plateforme de déploiement.
