# Réglages GitHub du dépôt public

Ce fichier est la référence reproductible des réglages non versionnables. Il ne
remplace pas les contrôles GitHub : après chaque modification, un mainteneur
vérifie l'écran Settings et met à jour la date ci-dessous.

Dernière vérification : 18 août 2026, dépôt encore privé sur le plan GitHub
gratuit. Les protections de branche et approbations d'environnement sont
volontairement reportées à MIN-388 tant que GitHub ne les rend pas applicables.
Les workflows décrivent déjà le chemin cible ; aucune publication ne doit être
annoncée avant que les réglages ci-dessous aient été activés et testés.

## Réglages déjà applicables

- Issues et Discussions activées ; suppression automatique des branches après
  fusion.
- **Squash merge uniquement** ; merge commits et rebase merge désactivés.
- Actions limitées aux actions GitHub et à `pnpm/action-setup@*`, avec jeton en
  lecture seule dans les workflows de pull request.
- Dependency graph, Dependabot alerts et Dependabot security updates activés.
- Labels : `bug`, `enhancement`, `documentation`, `dependencies`, `security`,
  `needs reproduction`, `breaking change`, `status: blocked`, `good first
  issue` et `help wanted`.

## À appliquer lors de la publication (MIN-388)

1. Activer **Private vulnerability reporting**, **Secret scanning** et **Push
   protection** dans Security → Code security and analysis.
2. Dans Actions → General, choisir **Require approval for all external
   contributors**. Ne jamais utiliser `pull_request_target` pour exécuter le
   code d'une PR.
3. Protéger `main`, administrateurs inclus :
   - pull request obligatoire, une approbation et revue code owner ;
   - invalider les approbations obsolètes, exiger l'approbation du dernier push
     par une autre personne et résoudre toutes les conversations ;
   - interdire suppression, force-push et contournement ;
   - exiger un historique linéaire ;
   - exiger `CI / Tests & typecheck`, `CI / Audit des dépendances` et
     `DCO / Developer Certificate of Origin` à jour avant fusion.
4. Protéger `production` contre suppression, force-push et écriture humaine.
   Conserver l'historique linéaire et exiger les deux checks CI du SHA ; le
   workflow `Promote production` est l'unique exception d'écriture directe.
5. Créer deux environnements GitHub :
   - `cloud-production`, avec approbateurs requis, autorisé uniquement depuis
     `main`, et le workflow `Promote production` comme seul chemin d'écriture
     vers `production`. L'approbateur ouvre la référence de revue produite avec
     [`docs/security-release-checklist.md`](../docs/security-release-checklist.md),
     vérifie les exceptions/risques résiduels et la décision de pentest avant
     d'autoriser le job ;
   - `public-release`, avec approbateurs requis, autorisé uniquement depuis
     `production` et les tags protégés `v*`, contenant les secrets Apple et du
     flux desktop décrits dans `docs/releases.md`.
6. Vérifier que l'intégration Vercel suit uniquement `production` pour le projet
   public et crée un GitHub Deployment nommé `Production` avec son URL immuable.
7. Ouvrir une pull request de test depuis un fork sans historique de confiance :
   vérifier que le workflow attend l'approbation, qu'aucun secret n'est exposé,
   qu'un commit sans sign-off échoue et qu'un mainteneur ne peut pas fusionner
   tant que chaque règle n'est pas satisfaite.
8. Vérifier les liens des formulaires, le bouton **Report a vulnerability**, les
   catégories de Discussions et la création des premières PR Dependabot.

Une urgence peut nécessiter une dérogation temporaire. Elle est limitée au
mainteneur principal, consignée dans une issue ou un avis de sécurité dès que la
confidentialité le permet, puis les règles sont réactivées immédiatement.
