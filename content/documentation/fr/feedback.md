---
{
  "id": "feedback",
  "locale": "fr",
  "title": "Retours",
  "summary": "Publiez un espace de retours, suivez les demandes, modérez les contributions et reliez les retours retenus au travail du projet.",
  "topic": "Retours et demandes",
  "type": "guide",
  "audiences": [
    "owner",
    "visitor",
    "member"
  ],
  "workflows": [
    "F01",
    "F02",
    "F03",
    "F04",
    "F05"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 3,
  "sourceRevision": 3,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-09",
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
      "content/knowledge/feedback.md",
      "components/project-feedback-settings.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/posts.ts",
      "content/documentation/reviews/feedback-local-capture-candidates.json",
      "app/f/[token]/feedback-auth.tsx",
      "app/f/[token]/actions.ts",
      "app/f/[token]/me/page.tsx",
      "lib/server/feedback/otp.ts",
      "lib/feedback/types.ts",
      "components/feedback/feedback-team-page.tsx",
      "lib/server/feedback/comment-guard.ts",
      "app/api/projects/[id]/feedback/[postId]/comments/route.ts",
      "app/api/projects/[id]/feedback/[postId]/promote/route.ts",
      "app/api/projects/[id]/feedback/[postId]/link/route.ts",
      "lib/server/feedback/merge.ts",
      "lib/server/feedback/status-sync.ts",
      "lib/server/feedback/notify.ts",
      "components/feedback/feedback-settings-shared.tsx",
      "lib/server/feedback/public-nav.ts"
    ]
  },
  "review": {
    "revision": 3,
    "fact": "agent:/root/english_french_review with agent:/root (consolidation and retained-claim review; prior procedural evidence inherited; no operational rerun)",
    "language": "agent:/root/english_french_review (fr editorial, feature-scope and retained-meaning review)",
    "date": "2026-10-09"
  },
  "related": [
    "api-and-webhooks"
  ],
  "aliases": [
    "publish-a-feedback-board",
    "submit-and-follow-feedback",
    "moderate-feedback",
    "feedback-to-issue",
    "feedback-pages-and-views"
  ],
  "tags": [
    "Publier un tableau de retours",
    "Soumettre, voter et suivre un retour",
    "Examiner les retours en privé et répondre publiquement",
    "Fusionner des retours et les relier à la livraison",
    "Ajouter pages et vues publiques au tableau"
  ],
  "figures": [
    {
      "id": "publish-a-feedback-board-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/publish-a-feedback-board-workflow.png",
      "alt": "Board public de retours activé, avec identité SSO locale configurée et URL masquée.",
      "caption": "Le propriétaire active le board et choisit l’identité des visiteurs. Cet exemple utilise une signature SSO locale ; l’URL et le secret de signature sont masqués.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1150
      ],
      "theme": "light"
    },
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/submit-and-follow-feedback-workflow.png",
      "alt": "Formulaire visiteur avec titre, description et visibilité publique activée.",
      "caption": "Un visiteur identifié soumet un besoin et choisit sa visibilité. L’exemple a été réellement envoyé avec la revue automatique désactivée.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1365,
        1000
      ],
      "theme": "light"
    },
    {
      "id": "moderate-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/moderate-feedback-workflow.png",
      "alt": "Détail d’un retour avec réponse publique de l’équipe et note interne.",
      "caption": "Le badge Public distingue la réponse visible aux visiteurs ; la note interne reste accessible à l’équipe. Aucun résultat de modération IA n’est présenté.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "feedback-to-issue-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/feedback-to-issue-workflow.png",
      "alt": "Retour lié à un ticket créé, avec le statut Prévu.",
      "caption": "La promotion de cet exemple a créé un ticket lié en statut À faire. Le retour public est automatiquement passé à Prévu.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1440,
        1100
      ],
      "theme": "light"
    },
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/feedback-pages-and-views-workflow.png",
      "alt": "Guide des retours publié, sélectionné dans la navigation du board et lisible sans connexion.",
      "caption": "Publiez une page, activez les onglets de pages et sélectionnez-la pour le board. Cette page de démonstration a été ouverte anonymement ; son URL opaque conserve noindex.",
      "revision": 3,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        1100,
        650
      ],
      "theme": "light"
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow",
    "submit-and-follow-feedback-workflow",
    "moderate-feedback-workflow",
    "feedback-to-issue-workflow",
    "feedback-pages-and-views-workflow"
  ]
}
---

Les retours relient les demandes des visiteurs au travail de revue et de réalisation de l’équipe. Le propriétaire configure le tableau public, les visiteurs soumettent et suivent leurs demandes, et les membres les modèrent ou les associent à des tickets. Distinguez les réponses publiques, les notes internes et les pages ou vues publiées séparément lorsque vous gérez les accès.

## Publier un tableau de retours {#publish-a-feedback-board}

En tant que propriétaire, ouvrez Retours dans les réglages du projet. Terminez la configuration si aucun board n’existe, puis activez le canal du board public. Copiez son URL publique et ouvrez-la dans un navigateur déconnecté pour vérifier la vue des visiteurs. Les membres peuvent consulter les réglages, mais ne peuvent ni modifier la publication, ni renouveler les tokens, ni gérer le secret SSO.

Choisissez l’identification des visiteurs par code email ou par SSO configuré. Réglez les commentaires publics, l’affichage des catégories et les onglets des pages ou vues publiques sélectionnées. Examinez les données visibles avant de diffuser l’URL. Les visiteurs peuvent lire sans s’identifier ; publier un retour, voter et commenter exigent une identité sur le board. Les représentations publiques n’exposent ni l’email ni le vrai nom des visiteurs, tandis que l’équipe peut traiter leurs retours identifiés en privé.

### Publication et ingestion sont distinctes {#channels}

Désactiver le board rend ses pages inaccessibles aux visiteurs. L’ingestion de serveur à serveur utilise une clé d’intégration feedback distincte et peut continuer sans board public. Le choix de visibilité d’un retour, son état de revue et son statut spam contrôlent aussi son affichage : activer le board ne publie pas à lui seul tous les retours.

La revue Numo facultative s’applique aux retours soumis et dépend des réglages du projet et de l’instance, des fournisseurs et du budget du propriétaire. Si elle est activée, les soumissions attendent leur revue avant publication ; si elle est désactivée, elles n’attendent pas une revue inexistante. Vérifiez la file de revue après une soumission de démonstration. Numo n’envoie une réponse publique que sur demande explicite.

![Board public de retours activé, avec identité SSO locale configurée et URL masquée.](/documentation/fr/publish-a-feedback-board-workflow.png)

## Soumettre, voter et suivre un retour {#submit-and-follow-feedback}

Ouvrez l’URL publique du board. Vous pouvez lire les retours publics sans compte minddy. Pour soumettre, voter ou commenter, identifiez-vous par le code email du board ou le lien SSO du produit. La réception du code dépend du service email de l’instance. Un code reste valable dix minutes et autorise cinq tentatives ; attendez au moins soixante secondes avant d’en demander un autre. Ne partagez jamais ce code.

Recherchez les demandes existantes avant d’en publier une. Donnez un titre précis et décrivez le besoin et son contexte. Le titre accepte 200 caractères et le corps 10 000. L’option publique est cochée par défaut ; décochez-la pour adresser la demande en privé à l’équipe. Vérifiez que le texte ne contient pas de secrets avant l’envoi. Une modération facultative peut maintenir la demande en attente avant son affichage public.

### Voter, commenter et suivre {#follow}

Votez pour une demande existante plutôt que de la dupliquer. Votre identité dispose d’un vote par retour. Pour commenter, vous devez vous identifier et les commentaires publics doivent être activés ; un commentaire public accepte 5 000 caractères. Vous pouvez supprimer votre propre commentaire et l’équipe peut modérer les commentaires publics.

Ouvrez Mes retours pour retrouver vos demandes et vos votes, selon les droits de votre identité actuelle. Consultez leur statut public et les réponses de l’équipe à cet endroit ou sur la demande. Les notes réservées à l’équipe ne sont pas des réponses publiques. Si le SSO a expiré, revenez par un nouveau lien du produit ; un changement de navigateur ou d’identité peut modifier cette liste personnelle.

![Formulaire visiteur avec titre, description et visibilité publique activée.](/documentation/fr/submit-and-follow-feedback-workflow.png)

## Examiner les retours en privé et répondre publiquement {#moderate-feedback}

Les membres du projet ouvrent sa rubrique Retours et choisissent une demande dans la file de revue ou la liste. Lisez la soumission d’origine, le choix public ou privé, l’état de revue et les éventuelles suggestions de modération ou de doublon. Vous pouvez clarifier le titre et le corps canoniques tout en conservant les textes soumis d’origine. Attribuez des catégories et un statut public adapté ; un spam n’apparaît jamais sur le board public. Une demande privée reste distincte d’une demande publique simplement en attente.

Une traduction facultative s’affiche à côté du texte source pour l’équipe ; le board public conserve le retour tel qu’il a été écrit. Vérifiez les classifications IA avant de vous y fier. Si un retour est lié à un ticket, son statut est contrôlé par ce ticket et ne peut pas être modifié indépendamment.

### Notes et réponses publiques {#responses}

Choisissez la discussion interne pour les notes d’équipe. Les réponses publiques sont visibles aux visiteurs : vérifiez la visibilité avant l’envoi. Une réponse hérite de la visibilité de son fil ; choisir le mode interne dans le composeur ne rend pas privée une réponse à un fil public. Les réponses publiques de Numo exigent une demande explicite ; mentionner Numo dans un commentaire public ne déclenche pas de réponse automatique.

Les membres de l’équipe peuvent supprimer des commentaires publics pour les modérer. Seul l’auteur peut modifier son texte ; l’équipe ne réécrit jamais les propos des visiteurs. Les commentaires internes conservent leurs règles réservant les actions à l’auteur. Après une réponse publique ou une modération, consultez le board déconnecté pour vérifier la visibilité obtenue.

![Détail d’un retour avec réponse publique de l’équipe et note interne.](/documentation/fr/moderate-feedback-workflow.png)

## Fusionner des retours et les relier à la livraison {#feedback-to-issue}

En tant que membre du projet, ouvrez la demande et choisissez de la fusionner dans une demande canonique existante du même projet. Lisez d’abord les deux besoins : des formulations similaires ne prouvent pas qu’ils visent le même résultat. La demande courante devient le doublon, les votes sont réunis par identité et le doublon redirige vers la demande canonique. Examinez l’événement de fusion dans l’activité ; l’annulation utilise cet événement. Refusez une suggestion de fusion IA incorrecte plutôt que de l’accepter pour vider la file.

### Créer ou lier du travail {#work}

Créez un ticket à partir de la demande si le travail n’est pas encore suivi. Vérifiez les champs de création avant de confirmer ; sans champs fournis, la promotion crée par défaut un ticket dans le backlog. Si un ticket existe déjà, utilisez plutôt l’action de liaison. Un retour déjà lié ne peut pas être promu de nouveau. Retirer la liaison conserve le dernier statut public et arrête la relation avec le ticket.

Le statut lié suit celui du ticket : triage/backlog/duplicate → open ; todo → planned ; in_progress/in_review → in_progress ; done → shipped ; canceled → declined. Replacer le travail dans le backlog rouvre aussi le statut du retour. Vérifiez le ticket lié et la demande en navigation déconnectée après un changement d’état.

Les notifications de l’équipe à l’arrivée d’un retour dépendent de sa source et de sa transition de revue. Ne promettez pas à un votant un email automatique pour chaque fusion ou mise à jour de ticket ; il peut consulter le statut public et les réponses dans Mes retours. La liaison rend l’avancement visible sans exposer le ticket privé lui-même.

![Retour lié à un ticket créé, avec le statut Prévu.](/documentation/fr/feedback-to-issue-workflow.png)

## Ajouter pages et vues publiques au tableau {#feedback-pages-and-views}

En tant que propriétaire du projet, publiez d’abord la page souhaitée ou partagez la vue souhaitée avec une visibilité publique. Vérifiez l’absence d’informations privées. Ouvrez les réglages Retours, activez la famille des pages ou des vues et sélectionnez chaque élément à afficher. L’interrupteur de la famille et la sélection de chaque élément sont tous deux nécessaires.

La liste des réglages peut contenir des partages protégés, mais la navigation publique n’inclut que les partages de niveau public. Sélectionner une page protégée ne contourne pas sa protection et n’expose pas son nom dans un onglet du board. Un élément publié dans un autre projet ne fait pas partie des onglets de ce projet.

### Vérifier et retirer l’accès {#visibility}

Ouvrez le board déconnecté. Suivez ses onglets vers les vues et pages sélectionnées et vérifiez leurs titres et leurs contenus. Lorsqu’elle est configurée, la navigation est commune au board, aux vues publiques et aux pages publiques ; un onglet isolé n’est pas affiché comme navigation.

Pour retirer un onglet, désélectionnez l’élément ou désactivez sa famille. Cela retire la navigation, pas le partage sous-jacent. Révoquez ou modifiez le partage lui-même pour supprimer l’accès par lien direct. Désactiver le board désactive aussi sa navigation associée, sans révoquer indépendamment tous les partages de pages et de vues. Après une modification de publication, vérifiez l’onglet du board et l’URL du partage d’origine.

![Guide des retours publié, sélectionné dans la navigation du board et lisible sans connexion.](/documentation/fr/feedback-pages-and-views-workflow.png)
