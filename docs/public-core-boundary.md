# Frontière du cœur public

Le dépôt public contient le produit Minddy que l'on peut exécuter ou
auto-héberger. Il ne contient pas les opérations du service Minddy Cloud. Une
fonction reste dans le cœur lorsqu'elle sert un utilisateur d'une instance,
même lorsqu'elle est déclenchée en arrière-plan. Une fonction dont le seul
consommateur est l'équipe qui opère `minddy.app` doit vivre hors de ce dépôt.

## Inventaire et décision

| Surface | Propriétaire | Destination | Décision |
| --- | --- | --- | --- |
| Produit collaboratif, notifications de projet, mentions, agents, routines et automatisations | Communauté / administrateur de l'instance | Cœur public | Conservé : ce sont des fonctionnalités utilisateur, pas de l'observabilité d'exploitation. |
| API et panneau `/admin`, lecture de tous les comptes, suivi des coûts et réglages globaux de modèles | Administrateur de l'instance | Cœur public | Conservé : l'accès est contrôlé côté serveur par rôle ou `ADMIN_EMAILS`. Aucun secret de Minddy Cloud n'est embarqué. |
| Cadeaux de plans, overrides manuels, remise à zéro de quotas et marquage de comptes internes | Administrateur de l'instance | Module commercial optionnel | Conservé : outils de support utiles à une instance, y compris les comptes de démonstration et de capture. |
| Alertes brrr de nouvelle inscription et de budget plateforme | Exploitation Minddy Cloud | Dépôt privé des opérations cloud | Retirées. Elles ne sont pas les notifications affichées aux utilisateurs de Minddy. |
| Stripe, IA de plateforme et leurs routes de facturation | Module commercial optionnel | Configuration de l'instance / module commercial | Conservé à titre optionnel. Les drapeaux `MINDDY_MANAGED_*` restent désactivés sans configuration complète. |
| Crons de routines, automatisations, rétention, feedback, synchronisation de facturation | Produit ou module commercial | Cœur public / module commercial | Conservés : ils réalisent des fonctions demandées par les utilisateurs. Une plateforme les planifie selon son propre déploiement. |
| `deploy.sh` et publication de l'app de bureau | Administrateur de l'instance | Cœur public | Conservés : un assistant unique orchestre des chaînes CI isolées pour le cœur, le Cloud et le desktop, sans secret personnel ni endpoint d'administration embarqué. |
| IndexNow, backfills, seed d'inbox, bucket d'avatars et extraction APNs | Exploitation ou maintenance ponctuelle Minddy Cloud | Dépôt privé des opérations cloud | Retirés du dépôt public. |
| Documents d'audit, captures ou paramètres propres à une machine/production | Exploitation Minddy Cloud | Dépôt privé des opérations cloud ou suppression | Ignorés et refusés par la barrière de publication. |

## Contrat vérifiable

`npm run check:public-repo` est la barrière de publication. Elle rejette les
chemins, les secrets et les marqueurs d'exploitation interdits dans l'index. La
CI l'exécute avant toute installation de dépendances. Pendant le développement,
`node scripts/check-public-repo.mjs --worktree` applique la même règle au
répertoire de travail avant l'ajout à l'index.

La barrière ne réécrit pas l'historique Git : avant la première publication,
le mainteneur doit publier une histoire assainie (ou une branche neuve) si une
révision atteignable contient un secret ou un artefact privé. Le contrôle scanne
déjà les objets atteignables pour les artefacts explicitement interdits.

Pour ajouter une capacité, décider d'abord sa ligne dans cet inventaire. Une
interface d'administration d'instance est publique si elle est protégée et ne
dépend d'aucun secret Minddy Cloud ; les alertes et outils propres à l'opérateur
restent dans le dépôt privé des opérations cloud.

## Destination Minddy Cloud

Le périmètre d'exploitation est le dépôt GitHub privé
`mangue-dev/minddy-cloud-ops`. Il ne reçoit que la configuration déclarative,
les alertes et la supervision internes, les backfills Cloud, les procédures
d'incident et les intégrations support/CRM. Son contrat épingle un SHA complet
de ce cœur, l'arbre de migrations, les noms de variables, les jobs planifiés et
les endpoints opérateur ; sa provenance relie chaque production aux deux SHA.

Cette désignation est informative, jamais une dépendance de build ou
d'exécution : un clone public ne lit pas ce dépôt, ne connaît aucun de ses
secrets et conserve toutes les fonctionnalités nécessaires à l'auto-hébergement.
Toute fonction produit ou administration générique née d'un besoin Cloud est
d'abord ajoutée ici, dans le cœur public, puis seulement consommée par le dépôt
d'exploitation.
