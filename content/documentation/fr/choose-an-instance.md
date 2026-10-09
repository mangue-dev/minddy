---
{
  "id": "choose-an-instance",
  "locale": "fr",
  "title": "Instances Cloud et auto-hébergées",
  "summary": "Comparez les responsabilités d’exploitation, les destinations des données et les fournisseurs optionnels à configurer.",
  "topic": "Premiers pas",
  "type": "explanation",
  "audiences": [
    "member",
    "operator"
  ],
  "workflows": [
    "S07"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 4,
  "sourceRevision": 4,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
  "compatibility": {
    "version": "v0.11.0",
    "editions": [
      "Cloud",
      "self-hosted"
    ],
    "profiles": [
      "Cloud",
      "self-hosted"
    ],
    "evidence": [
      "docs/editions.md",
      "content/knowledge/open-source.md",
      "docs/self-hosting-distribution.md"
    ]
  },
  "review": {
    "revision": 4,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun); agent:/root (visual usefulness, figure framing and preserved procedures; previous operational evidence retained); agent:/root (technical-reference formatting; prior factual evidence retained; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review); agent:/root/editorial_en_fr (editorial clarity pass); agent:/root (figure removals and captions); agent:/root (inline-code syntax and unchanged-text review)",
    "date": "2026-10-09"
  },
  "related": [
    "installation",
    "transfer-between-instances",
    "architecture-and-data-flows"
  ],
  "aliases": [
    "open-source"
  ],
  "tags": [
    "Choisir le Cloud ou votre propre instance"
  ],
  "figures": [],
  "requiredFigures": []
}
---

## Choisir un mode d’exploitation {#choose-an-instance}

minddy Cloud et minddy auto-hébergé utilisent le même cœur public. Choisissez le Cloud si vous souhaitez que minddy exploite l’application, la base de données, Storage et le planificateur. Choisissez l’auto-hébergement si vous devez maîtriser le lieu d’hébergement, les fournisseurs ou le calendrier des mises à jour et pouvez exploiter ces services.

Un compte Cloud appartient au Cloud. Sur une instance auto-hébergée, créez un compte sur cette instance ; aucun compte minddy Cloud n’est nécessaire. Vérifiez l’adresse avant de vous connecter ou d’inviter quelqu’un. Deux instances utilisant minddy ne partagent pas automatiquement leurs comptes ni leurs identifiants.


## Responsabilités et coûts {#responsibilities}

| Responsabilité | Cloud | Auto-hébergement |
| --- | --- | --- |
| Infrastructure, mises à jour et incidents | minddy exploite le service. | Vous assurez la maintenance des hôtes, du TLS, de la supervision et des mises à jour. |
| Sauvegardes et récupération | minddy exploite le service Cloud. | Vous conservez les données de la base, les fichiers Storage, la configuration et les clés de chiffrement, puis testez les restaurations. |
| Comptes fournisseurs | minddy détient les comptes des services qu’il exploite. | Vous choisissez et payez l’infrastructure et les fournisseurs optionnels. |
| Assistance | Les conditions d’assistance Cloud s’appliquent. | Les outils de release et l’aide communautaire, sans garantie de résultat, couvrent les défauts reproductibles du cœur ; aucun SLA d’exploitation de votre infrastructure n’est inclus. |

Une équipe sans capacité d’exploitation de bases de données peut par exemple utiliser le Cloud. Un opérateur soumis à des exigences de localisation des données peut choisir l’auto-hébergement et examiner les destinations de chaque fournisseur activé. Héberger l’application ne rend pas local un fournisseur externe d’IA, d’e-mail ou de Git.

## Services nécessaires et optionnels {#services}

Une installation auto-hébergée prise en charge nécessite l’application et Supabase avec PostgreSQL, Auth, Storage et Realtime. PostgreSQL seul ne suffit pas. Utilisez une release étiquetée et sa matrice de compatibilité. Les variantes dérivées de Supabase sans version épinglée et les adaptateurs GitHub Enterprise ou GitLab auto-gérés sont hors du périmètre pris en charge.

L’IA, les e-mails, Git, les notifications push et les statistiques d’usage dépendent de la configuration. L’auto-hébergement n’exige ni Stripe, ni PostHog, ni clé d’IA gérée par minddy, ni compte Cloud. Une configuration optionnelle manquante est signalée ; aucun fournisseur ne la remplace silencieusement. Les clés d’IA personnelles et les points d’accès d’IA locaux sont des choix possibles ; leur disponibilité et leurs coûts dépendent de la capacité configurée.

Examinez les permissions et les conditions de traitement des données avant d’activer une intégration. Les connexions Git peuvent utiliser le relais de forge géré lorsque vous lancez explicitement l’intégration ; les applications fournisseurs détenues par l’opérateur et la désactivation du relais restent possibles. L’auto-hébergement ne constitue pas une offre réduite pour l’accès aux fonctions du cœur.

## Sources et prochaine étape {#next-step}

Le dépôt de référence est [`mangue-dev/minddy`](https://github.com/mangue-dev/minddy), sous GNU AGPL v3.0 uniquement. Respectez la licence et les règles de nommage pour les versions modifiées ou hébergées. Pour installer une instance, ouvrez le [guide d’installation auto-hébergée](/fr/documentation/installation) et son assistant. Avant de transférer votre travail, consultez le [guide de transfert entre instances](/fr/documentation/transfer-between-instances) : les identifiants et les abonnements ne sont pas transférés avec les données du compte.
