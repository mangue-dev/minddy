---
{
  "id": "encryption-and-data-boundaries",
  "locale": "fr",
  "title": "Chiffrement et limites de protection des données",
  "summary": "Après configuration et migration, minddy chiffre contenu et fichiers avant leur stockage durable avec un chiffrement authentifié côté serveur.",
  "topic": "Concepts techniques",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "T04"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 6,
  "sourceRevision": 6,
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
      "docs/self-hosting.md",
      "lib/server/encryption/data-policy.json",
      "lib/server/encryption.ts",
      "docs/editions.md"
    ]
  },
  "review": {
    "revision": 6,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, no correction needed; no screenshot in scope; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
  },
  "related": [
    "workspace-encryption",
    "backups-and-restoration",
    "permissions-and-public-links"
  ],
  "aliases": [],
  "tags": [
    "Comprendre le chiffrement et ses limites"
  ],
  "figures": [
    {
      "id": "encryption-and-data-boundaries-flow",
      "kind": "diagram",
      "src": "/documentation/fr/encryption-and-data-boundaries-flow.svg",
      "alt": "Schéma: Contenu durable chiffré et clés enveloppées. Racine conservée dans le serveur protégé. Le runtime autorisé peut déchiffrer. Exports et fournisseurs : protection distincte.",
      "caption": "L’application peut déchiffrer le contenu stocké pour les accès autorisés ; les exports et les services externes nécessitent une protection distincte.",
      "revision": 6,
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
            "title": "Contenu durable chiffré et clés enveloppées"
          },
          {
            "title": "Racine conservée dans le serveur protégé"
          },
          {
            "title": "Le runtime autorisé peut déchiffrer"
          },
          {
            "title": "Exports et fournisseurs : protection distincte"
          }
        ]
      }
    }
  ],
  "requiredFigures": [
    "encryption-and-data-boundaries-flow"
  ]
}
---

## Comprendre le chiffrement et ses limites {#encryption-and-data-boundaries}

Après configuration et migration, minddy chiffre le contenu et les fichiers avant leur stockage durable, avec un chiffrement authentifié côté serveur. Les clés des projets, des utilisateurs et du système sont versionnées et enveloppées par une clé racine dédiée, conservée hors de PostgreSQL. Une extraction de la base seule ne permet pas de lire le contenu protégé sans ses clés. L’application déchiffre ce contenu pour les accès autorisés, la recherche et le travail IA autonome. Un environnement d’exécution compromis ou l’accès simultané aux clés et aux données franchit cette protection. Il ne s’agit pas d’un chiffrement de bout en bout qui empêcherait l’opérateur de lire le contenu.


![Schéma: Contenu durable chiffré et clés enveloppées. Racine conservée dans le serveur protégé. Le runtime autorisé peut déchiffrer. Exports et fournisseurs : protection distincte.](/documentation/fr/encryption-and-data-boundaries-flow.svg)

## Repérer les données lisibles et exportées {#exceptions}

Auth conserve l’e-mail de connexion comme identité du compte. Les identifiants de routage, les clés des projets et tickets, les statuts, les priorités, les dates et les autres métadonnées autorisées restent interrogeables. Le contenu publié est volontairement lisible par son public. Les exports, fichiers téléchargés, contenus visibles dans le navigateur et données envoyées aux fournisseurs externes d’IA, d’e-mail, de Git ou de MCP nécessitent leurs propres protections. Activer un paramètre ne prouve pas que les copies historiques, journaux ou données conservées chez les fournisseurs ont été convertis ou supprimés. Ne déduisez jamais l’état du chiffrement Cloud en production du seul code du dépôt.

## Préserver la récupération {#recovery}

Protégez `MINDDY_DATA_ROOT_KEY` hors de la base et gardez des copies de récupération pour les sauvegardes actuelles et anciennes. Restaurez ensemble la base, les octets Storage et la configuration correspondante. Chiffrez la sauvegarde externe si elle contient à la fois les données et les clés. Changer de racine sans réenvelopper les clés rend le contenu illisible ; désactiver le chiffrement ne transforme pas les données chiffrées en texte clair. Testez la récupération avant d’activer le chiffrement sur des données existantes, puis vérifiez le contenu déchiffré et les octets téléchargés.
