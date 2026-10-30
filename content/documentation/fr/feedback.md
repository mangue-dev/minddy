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
  "revision": 15,
  "sourceRevision": 15,
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
      "content/knowledge/feedback.md",
      "components/project-feedback-settings.tsx",
      "app/api/projects/[id]/feedback/settings/route.ts",
      "lib/server/feedback/posts.ts",
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
      "lib/server/feedback/public-nav.ts",
      "app/f/[token]/voice/route.ts",
      "app/f/[token]/feedback-board-client.tsx",
      "lib/server/feedback/voice.ts",
      "lib/server/feedback/voice-limits.ts",
      "supabase/migrations/20270106320000_atomic_public_feedback_and_share_limits.sql",
      "docs/security/project-roles.md",
      "lib/project-roles.ts",
      "components/project-integrations.tsx",
      "app/f/[token]/public-comments.tsx"
    ]
  },
  "review": {
    "revision": 15,
    "fact": "agent:/root/min747 (0.20.0 release review: source audit against the v0.11.0..main delta, verified corrections applied; 2 screenshot(s) recaptured on 2026-10-20 from the local candidate and inspected; 2 screenshot(s) without a current capture script keep their earlier capture and evidence; no browser walkthrough of the procedures or operator rehearsal; earlier evidence retained in git history); agent:claude-code (manual figures rebuilt on the Aurora demo, catalog review labels and informal register; figures recaptured on 2026-10-22 from a local candidate against the preview demo account and inspected; no form submitted)",
    "language": "agent:/root/min747 (fr translation of the release corrections with catalog UI labels; equivalent meaning self-reviewed; agent review, not human acceptance); agent:claude-code (fr manual figures rebuilt on the Aurora demo, catalog review labels and informal register; self-reviewed; agent review, not human acceptance)",
    "date": "2026-10-22"
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
      "alt": "Board public de retours activé, avec identité des visiteurs par code e-mail, l’action Activer le SSO et URL masquée.",
      "caption": "Le propriétaire active le board et choisit l’identité des visiteurs. Ce board de démonstration utilise la vérification par e-mail ; son URL est masquée.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        816,
        596
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "submit-and-follow-feedback-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/submit-and-follow-feedback-workflow.png",
      "alt": "Formulaire visiteur avec titre, description et visibilité publique activée.",
      "caption": "Un visiteur identifié soumet un besoin et choisit sa visibilité. L’exemple a été réellement envoyé avec la revue automatique désactivée.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        624,
        394
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "feedback-objective-selection",
      "kind": "screenshot",
      "src": "/documentation/fr/feedback-objective-selection.png",
      "alt": "Aperçu des composants de sélection d’objectif pour un retour et une intégration, tous deux réglés sur Docs.",
      "caption": "Sélecteurs d’objectif avec des données de démonstration. Les nouveaux retours héritent du réglage de l’intégration.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-10",
      "viewport": [
        680,
        301
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    },
    {
      "id": "feedback-pages-and-views-workflow",
      "kind": "screenshot",
      "src": "/documentation/fr/feedback-pages-and-views-workflow.png",
      "alt": "Guide des retours publié, sélectionné dans la navigation du board et lisible sans connexion.",
      "caption": "Publiez une page, activez les onglets de pages et sélectionnez-la pour le board. Cette page de démonstration a été ouverte anonymement ; son URL opaque conserve `noindex`.",
      "revision": 15,
      "reviewed": true,
      "capturedAt": "2026-10-22",
      "viewport": [
        1328,
        668
      ],
      "theme": "light",
      "padding": 24,
      "deviceScaleFactor": 2
    }
  ],
  "requiredFigures": [
    "publish-a-feedback-board-workflow",
    "submit-and-follow-feedback-workflow",
    "feedback-objective-selection",
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

Le propriétaire active ou désactive la **Revue par Numo** dans les réglages Retours du projet ; il n’y a pas de réglage distinct au niveau de l’instance. Revue activée, les soumissions du tableau public et des intégrations attendent leur revue avant publication, tandis que les retours créés par l’équipe ne sont pas retenus. Tout ce qui est signalé comme sensible, par exemple une vulnérabilité ou des données personnelles, devient privé et attend sous **À revoir**. La revue s’appuie sur le fournisseur IA de l’instance et sur le budget IA du propriétaire du projet : quand ce budget est épuisé, les retours attendent, visibles de l’équipe seulement, sauf si le propriétaire active **Publier sans revue si le budget IA est épuisé**. Revue désactivée, les retours sont publiés tels quels, sans catégories automatiques, filtrage des canulars ni contrôle de confidentialité. Vérifiez la file de revue après une soumission de démonstration. Numo n’envoie une réponse publique que sur demande explicite.

![Board public de retours activé, avec identité des visiteurs par code e-mail, l’action Activer le SSO et URL masquée.](/documentation/fr/publish-a-feedback-board-workflow.png)

## Soumettre, voter et suivre un retour {#submit-and-follow-feedback}

Ouvrez l’URL publique du board. Vous pouvez lire les retours publics sans compte minddy. Pour soumettre, voter ou commenter, identifiez-vous par le code email du board ou le lien SSO du produit. La réception du code dépend du service email de l’instance. Un code reste valable dix minutes et autorise cinq tentatives ; attendez au moins soixante secondes avant d’en demander un autre. Ne partagez jamais ce code.

Recherchez les demandes existantes avant d’en publier une. Donnez un titre précis et décrivez le besoin et son contexte. Le titre accepte 200 caractères et le corps 10 000. L’option publique est cochée par défaut ; décochez-la pour adresser la demande en privé à l’équipe. Vérifiez que le texte ne contient pas de secrets avant l’envoi. Une modération facultative peut maintenir la demande en attente avant son affichage public.

Utilisez le microphone du formulaire pour dicter le titre et la description. Identifiez-vous d’abord sur le tableau, autorisez l’accès au microphone, puis arrêtez l’enregistrement et relisez le texte avant de choisir Envoyer. La dictée remplit le brouillon ; elle ne soumet pas la demande. Sa disponibilité dépend des fournisseurs de transcription et d’IA fonctionnels de l’instance et du budget IA du propriétaire du projet ; il n’y a pas de réglage distinct de l’instance pour la voix. La consommation est imputée à ce propriétaire selon ses réglages de fournisseurs, plutôt qu’au compte du visiteur.

Les enregistrements du tableau public sont limités à 10 MiB. La transcription autorise 20 requêtes par visiteur identifié et 40 par adresse IP et par heure, pour chaque tableau ; l’interprétation du brouillon a une limite distincte de 40 requêtes par visiteur et par heure. Ces limites sont distinctes de celles de la dictée du compte. En cas de message de limitation, attendez avant de réessayer ; si la voix est indisponible, saisissez la demande au clavier.

### Voter, commenter et suivre {#follow}

Votez pour une demande existante plutôt que de la dupliquer. Votre identité dispose d’un vote par retour, sur une demande que vous pouvez encore lire : publique, ou la vôtre. Pour commenter, vous devez vous identifier et les commentaires publics doivent être activés ; un commentaire public accepte 5 000 caractères. Un long fil s’ouvre sur ses derniers commentaires ; choisissez **Afficher les commentaires précédents** pour lire la suite. Vous pouvez supprimer définitivement votre propre commentaire après confirmation, et l’équipe peut modérer les commentaires publics.

Ouvrez Mes retours pour retrouver vos demandes et vos votes, selon les droits de votre identité actuelle. Consultez leur statut public et les réponses de l’équipe à cet endroit ou sur la demande. Les notes réservées à l’équipe ne sont pas des réponses publiques. Si le SSO a expiré, revenez par un nouveau lien du produit ; un changement de navigateur ou d’identité peut modifier cette liste personnelle.

![Formulaire visiteur avec titre, description et visibilité publique activée.](/documentation/fr/submit-and-follow-feedback-workflow.png)

## Examiner les retours en privé et répondre publiquement {#moderate-feedback}

Les filtres de la liste combinent statut, objectif, catégories, auteur, source et état de modération ; la visibilité est proposée lorsque le board public est activé. Plusieurs choix pour une propriété sont des alternatives ; les différentes propriétés se cumulent. Réinitialisez les filtres pour retrouver la liste initiale. La liste affiche jusqu’à 500 demandes correspondant à ces filtres à la fois. Ouvrez le sous-menu d’une propriété pour sélectionner ses valeurs ; le nombre indique combien sont sélectionnées. Sur mobile, dépliez la section de la propriété.

Le propriétaire du projet et les Membres ouvrent sa rubrique Retours et choisissent une demande dans la file de revue ou la liste. Les lecteurs peuvent lire les demandes, mais pas les modérer. Lisez la soumission d’origine, le choix public ou privé, l’état de revue et les éventuelles suggestions de modération ou de doublon. Vous pouvez clarifier le titre et le corps canoniques tout en conservant les textes soumis d’origine. Attribuez des catégories et un statut public adapté ; un spam n’apparaît jamais sur le board public. Une demande privée reste distincte d’une demande publique simplement en attente.

Une traduction facultative s’affiche à côté du texte source pour l’équipe ; le board public conserve le retour tel qu’il a été écrit. Vérifiez les classifications IA avant de vous y fier. Si un retour est lié à un ticket, son statut est contrôlé par ce ticket et ne peut pas être modifié indépendamment.

### Notes et réponses publiques {#responses}

Choisissez la discussion interne pour les notes d’équipe. Les réponses publiques sont visibles aux visiteurs : vérifiez la visibilité avant l’envoi. Un lecteur disposant de **Peut commenter** peut participer aux fils de discussion internes, mais ne peut pas répondre publiquement sur le board. Une réponse hérite de la visibilité de son fil ; choisir le mode interne dans le composeur ne rend pas privée une réponse à un fil public. Les réponses publiques de Numo exigent une demande explicite ; mentionner Numo dans un commentaire public ne déclenche pas de réponse automatique.

Les membres de l’équipe peuvent supprimer des commentaires publics pour les modérer. Seul l’auteur peut modifier son texte ; l’équipe ne réécrit jamais les propos des visiteurs. Les commentaires internes conservent leurs règles réservant les actions à l’auteur. Après une réponse publique ou une modération, consultez le board déconnecté pour vérifier la visibilité obtenue.

### Choisir un objectif pour un retour {#feedback-objective}

La liste affiche l’objectif lié sous l’auteur et les catégories. Dans les propriétés de l’objectif, le nombre de retours comprend ses demandes non supprimées et non fusionnées, y compris les demandes privées accessibles à l’équipe. Cliquez sur ce nombre pour ouvrir les retours filtrés sur cet objectif, tous statuts inclus.

En tant que propriétaire ou Membre, choisissez **Objectif** dans les propriétés du retour ou lors de sa création en interne. Choisissez **Aucun** pour retirer le lien. L’objectif doit appartenir à ce projet. Ce lien reste interne et n’expose pas les objectifs privés sur le tableau public. Il ne contribue pas à la progression des tickets.

Le propriétaire du projet peut choisir un objectif facultatif lors de la création d’une intégration de retours dans **Paramètres du projet** → **Intégrations**, ou le modifier ensuite sur la ligne **Objectif des nouveaux retours** sous une intégration de retours existante. Ce sélecteur peut aussi créer un nouvel objectif. Les nouveaux retours reçus par l’API héritent de cet objectif, y compris avec `analyze: false` ; modifier ce réglage ne déplace pas les retours existants. Si l’objectif est dans la corbeille, choisissez un objectif actif ou retirez le réglage avant un nouvel envoi. Numo ne choisit jamais d’objectif lors de la revue des retours. Demandez-lui explicitement de lier ou délier un retour si vous souhaitez son aide.

La conversion en ticket reprend l’objectif et les catégories du retour. Vous pouvez les modifier dans le formulaire de création. Sans objectif choisi, la conversion laisse ce champ vide, même si Smart Fill est activé. Modifier ensuite l’objectif du retour ne déplace pas un ticket déjà lié. Une fusion exige que les deux retours aient le même objectif, ou n’en aient aucun ; alignez leurs objectifs si l’équipe décide qu’ils décrivent le même besoin.

Un groupe fusionné partage un seul objectif. Modifier l’objectif du retour principal met aussi à jour les retours absorbés, pour permettre une nouvelle fusion du groupe.

![Aperçu des composants de sélection d’objectif pour un retour et une intégration, tous deux réglés sur Docs.](/documentation/fr/feedback-objective-selection.png)

## Fusionner des retours et les relier à la livraison {#feedback-to-issue}

En tant que propriétaire ou Membre, ouvrez la demande, choisissez **Fusionner dans…** et sélectionnez la demande canonique du même projet dans la palette de commandes. L’entrée n’apparaît que si une autre demande peut l’accueillir. Lisez d’abord les deux besoins : des formulations similaires ne prouvent pas qu’ils visent le même résultat. La demande courante devient le doublon, les votes sont réunis par identité et le doublon redirige vers la demande canonique. Si la demande canonique n’est pas publique, l’auteur du doublon l’ouvre toujours, en lecture seule, et les autres visiteurs n’obtiennent aucune page. Examinez l’événement de fusion dans l’activité ; l’annulation utilise cet événement. Refusez une suggestion de fusion IA incorrecte plutôt que de l’accepter pour vider la file.

### Créer ou lier du travail {#work}

Créez un ticket à partir de la demande si le travail n’est pas encore suivi. Vérifiez les champs de création avant de confirmer ; sans champs fournis, la promotion crée par défaut un ticket dans le `backlog`. Si un ticket existe déjà, utilisez plutôt l’action de liaison. **Lier à un ticket existant** ouvre la palette de commandes sur les tickets du projet, sauf ceux annulés ou en doublon. Décrire le besoin liste aussi des tickets trouvés [par le sens](/docs/navigation#search-by-meaning) sous **Liés par le sens**, après les correspondances textuelles, ce qui aide quand la demande ne reprend pas les mots du ticket. Un retour déjà lié ne peut pas être promu de nouveau. Retirer la liaison demande d’abord une confirmation ; cela conserve le dernier statut public et arrête la relation avec le ticket.

Le statut lié suit celui du ticket : `triage`/`backlog`/`duplicate` → `open` ; `todo` → `planned` ; `in_progress`/`in_review` → `in_progress` ; `done` → `shipped` ; `canceled` → `declined`. Replacer le travail dans le `backlog` rouvre aussi le statut du retour. Vérifiez le ticket lié et la demande en navigation déconnectée après un changement d’état.

Les notifications de l’équipe à l’arrivée d’un retour dépendent de sa source et de sa transition de revue. Ne promettez pas à un votant un email automatique pour chaque fusion ou mise à jour de ticket ; il peut consulter le statut public et les réponses dans Mes retours. La liaison rend l’avancement visible sans exposer le ticket privé lui-même.


## Ajouter pages et vues publiques au tableau {#feedback-pages-and-views}

En tant que propriétaire du projet, publiez d’abord la page souhaitée ou partagez la vue souhaitée avec une visibilité publique. Vérifiez l’absence d’informations privées. Ouvrez les réglages Retours, activez la famille des pages ou des vues et sélectionnez chaque élément à afficher. L’interrupteur de la famille et la sélection de chaque élément sont tous deux nécessaires.

La liste des réglages peut contenir des partages protégés, mais la navigation publique n’inclut que les partages de niveau public. Sélectionner une page protégée ne contourne pas sa protection et n’expose pas son nom dans un onglet du board. Un élément publié dans un autre projet ne fait pas partie des onglets de ce projet.

### Vérifier et retirer l’accès {#visibility}

Ouvrez le board déconnecté. Suivez ses onglets vers les vues et pages sélectionnées et vérifiez leurs titres et leurs contenus. Lorsqu’elle est configurée, la navigation est commune au board, aux vues publiques et aux pages publiques ; un onglet isolé n’est pas affiché comme navigation.

Pour retirer un onglet, désélectionnez l’élément ou désactivez sa famille. Cela retire la navigation, pas le partage sous-jacent. Révoquez ou modifiez le partage lui-même pour supprimer l’accès par lien direct. Désactiver le board désactive aussi sa navigation associée, sans révoquer indépendamment tous les partages de pages et de vues. Après une modification de publication, vérifiez l’onglet du board et l’URL du partage d’origine.

![Guide des retours publié, sélectionné dans la navigation du board et lisible sans connexion.](/documentation/fr/feedback-pages-and-views-workflow.png)
