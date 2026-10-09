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
  "revision": 4,
  "sourceRevision": 4,
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
      "desktop",
      "mobile",
      "full",
      "managed"
    ],
    "evidence": [
      "docs/editions.md",
      "docs/self-hosting-distribution.md",
      "lib/server/capabilities.ts",
      "content/documentation/reviews/editorial-clarity-en-fr-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-de-es-2026-10-09.md",
      "content/documentation/reviews/editorial-clarity-it-pt-BR-2026-10-09.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root/editorial_en_fr (collection-caption clarity); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
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
      "alt": "Schéma: Navigateur et application authentifiée. Supabase : PostgreSQL, Auth, Storage, Realtime. Planificateur indépendant et runner de confiance. Fournisseurs optionnels : destinations séparées.",
      "caption": "L’application coordonne l’accès aux données persistantes et le travail en arrière-plan, avec des destinations distinctes pour les intégrations externes.",
      "revision": 4,
      "reviewed": true,
      "capturedAt": "2026-10-08",
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
            "title": "Planificateur indépendant et runner de confiance"
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


![Schéma: Navigateur et application authentifiée. Supabase : PostgreSQL, Auth, Storage, Realtime. Planificateur indépendant et runner de confiance. Fournisseurs optionnels : destinations séparées.](/documentation/fr/architecture-and-data-flows-flow.svg)

## Suivre une requête {#requests}

Le navigateur utilise les origines publiques de l’application et de Supabase. Auth établit la session ; les points d’accès serveur vérifient l’identité de l’utilisateur et son accès à l’objet avant toute lecture ou modification. Realtime transmet les mises à jour aux sessions connectées. Dans le profil full, les appels serveur passent par Kong en interne, sans changer les origines du navigateur ni l’identité des liens de compte. Le planificateur appelle les tâches HTTP authentifiées indépendamment du navigateur. Le runner de confiance ouvre des sandboxes restreintes lorsque Numo doit travailler sur le code ; elles ne reçoivent ni les secrets de l’instance ni le socket Docker.

## Identifier les destinations externes {#providers}

Les modèles IA, les e-mails, Git, les serveurs MCP distants, les notifications push, les statistiques d’usage et le stockage externe ont leurs propres destinations lorsqu’ils sont activés. Héberger l’application ne rend pas ces services locaux. Avec Supabase géré, le fournisseur exploite le backend choisi ; le profil full place la pile épinglée sous votre contrôle. En Cloud, minddy exploite le service avec ses fournisseurs. En auto-hébergement, vous choisissez les services et fournissez les comptes nécessaires. Examinez les permissions, les coûts et les conditions de traitement des données de chaque intégration. Ne déduisez jamais un fournisseur ou l’édition Cloud d’un nom d’hôte ou d’une plateforme de déploiement.
