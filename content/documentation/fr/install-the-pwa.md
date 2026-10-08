---
{
  "id": "install-the-pwa",
  "locale": "fr",
  "title": "Installer l’application web sur téléphone ou tablette",
  "summary": "Ajouter son instance à l’écran d’accueil et comprendre réseau et notifications.",
  "topic": "Compte et applications",
  "type": "guide",
  "audiences": [
    "member"
  ],
  "workflows": [
    "A11"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (cd1843e12)",
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
      "components/marketing/mobile-pwa-install-guide.tsx",
      "components/marketing/mobile-install-guide-copy.ts",
      "public/sw.js",
      "content/documentation/reviews/pwa-guide-capture-candidates.json",
      "content/documentation/reviews/pwa-installation-probe.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "2026-10-08",
    "language": "2026-10-08",
    "date": "2026-10-08"
  },
  "related": [],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "install-the-pwa-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/install-the-pwa-workflow.png",
      "alt": "Guide Safari illustré de Minddy : Partager, Sur l’écran d’accueil puis confirmer.",
      "caption": "Le guide public illustre les trois étapes Safari et le maintien de l’option Ouvrir comme app web. Il s’agit d’illustrations pédagogiques affichées par Minddy, pas de captures d’une installation iOS effectuée.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1240,
        940
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "install-the-pwa-workflow"
  ]
}
---

## Installer depuis le navigateur {#install-the-pwa}
Ouvrez l’instance Minddy voulue dans Safari sur iPhone ou iPad, ou dans Chrome ou un autre navigateur Android compatible. Si le lien s’est ouvert à l’intérieur d’une autre application, ouvrez-le d’abord dans le navigateur complet. Pour une instance self-hosted, utilisez l’adresse de votre propre serveur.

Sur iOS, ouvrez Partager, choisissez Sur l’écran d’accueil, gardez Ouvrir comme app web activé, puis touchez Ajouter. Selon la présentation de Safari, ouvrez Plus avant Partager. Si l’action manque, consultez Modifier les actions.

Sur Android, utilisez la proposition d’installation ou choisissez Installer l’application ou Ajouter à l’écran d’accueil dans le menu du navigateur, puis confirmez Installer. Les libellés dépendent du navigateur. Ouvrez la nouvelle icône et connectez-vous avec le compte de cette instance. Il s’agit d’une PWA installée par le navigateur ; Minddy n’a pas d’application native dans l’App Store iOS ou Google Play.

## Mises à jour, accès hors ligne et notifications {#operation}
L’installation ne crée pas de copie hors ligne du projet. Le service worker de Minddy gère uniquement les notifications push et ne met pas les requêtes de l’application en cache. Gardez une connexion réseau et rechargez la page pour obtenir le contenu web actuel. Les notifications nécessitent aussi un navigateur compatible, son autorisation et une configuration push côté serveur. Sur iOS, utilisez l’application installée lorsque le parcours le demande. Si l’option d’installation manque, ouvrez un navigateur complet compatible et vérifiez si l’instance est déjà installée.

![Guide Safari illustré de Minddy : Partager, Sur l’écran d’accueil puis confirmer.](/documentation/fr/install-the-pwa-workflow.png)
