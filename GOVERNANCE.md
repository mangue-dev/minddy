# Gouvernance de minddy

Cette gouvernance s'applique au cœur public distribué sous AGPL-3.0-only. Elle
ne régit pas l'exploitation du service managé ni les contrats commerciaux,
séparés conformément à [docs/licensing.md](docs/licensing.md).

## Rôles

- **Contributeur** : toute personne qui signale, documente, révise ou propose un
  changement. Ce rôle ne donne aucun droit d'écriture.
- **Reviewer** : contributeur régulier auquel un mainteneur confie la revue et
  le triage sur un domaine. Il recommande une décision mais ne fusionne pas sans
  droit explicite.
- **Mainteneur** : personne disposant des droits de triage et de fusion. Elle
  garantit le périmètre, la qualité, la sécurité, la licence et la cohérence des
  décisions. Les mainteneurs sont propriétaires du code via
  [`.github/CODEOWNERS`](.github/CODEOWNERS).
- **Mainteneur principal** : responsable du dépôt et dernier arbitre lorsqu'un
  consensus est impossible. Ce rôle est actuellement tenu par
  [@mangue-dev](https://github.com/mangue-dev).

Un mainteneur peut promouvoir un reviewer ou un mainteneur après des
contributions soutenues, des revues fiables et une adhésion démontrée aux
politiques du projet. La décision est annoncée publiquement. Le rôle peut être
retiré après six mois d'inactivité, à la demande de la personne, ou pour raisons
de sécurité ou de conduite, avec une trace publique quand la confidentialité le
permet.

## Proposer et décider

1. Les bugs et améliorations passent par les formulaires d'issue. Un changement
   important (architecture, données, API, licence, sécurité ou compatibilité)
   doit être discuté et accepté avant son implémentation.
2. Les décisions ordinaires recherchent un **consensus paresseux** : en
   l'absence d'objection motivée pendant trois jours ouvrés, un mainteneur peut
   accepter. Une décision structurante reste ouverte au moins sept jours
   calendaires et consigne les options, contraintes et conséquences.
3. Une objection doit proposer un risque vérifiable ou une alternative. Le
   mainteneur responsable synthétise la décision dans l'issue ou la pull
   request. En cas de désaccord persistant, le mainteneur principal tranche et
   explique pourquoi.
4. Une urgence de sécurité peut être traitée en privé et fusionnée sans délai.
   La décision et les éléments publiables sont consignés après la correction.

Une personne se récuse lorsqu'elle a un intérêt financier direct, un conflit
personnel ou a produit seule le changement litigieux. Aucun auteur n'approuve
sa propre pull request. Les changements de licence, de frontière commerciale ou
de cette gouvernance exigent une issue dédiée et l'accord explicite du
mainteneur principal.

## Revue et fusion

Toute contribution externe arrive par pull request depuis une branche ou un
fork. Le mainteneur commence par lire le diff, en particulier les scripts,
workflows, manifests et lockfiles, avant d'autoriser l'exécution de CI. Les
instructions de sécurité sont détaillées dans [CONTRIBUTING.md](CONTRIBUTING.md).

Une pull request doit avoir un périmètre cohérent, une issue acceptée lorsque le
changement n'est pas trivial, des tests proportionnés au risque, une
documentation à jour, des commits conformes au DCO et tous les checks au vert.
Une approbation d'un code owner est requise. Une approbation devient caduque
après un nouveau push significatif. La fusion se fait par **squash merge** ; le
titre et le corps du commit final doivent conserver le contexte et le sign-off
DCO. Un mainteneur peut fermer une proposition correcte mais hors stratégie ou
impossible à maintenir.

## Branches et réglages GitHub

`main` est la branche d'intégration et `production` la branche de publication.
Les deux refusent les pushs directs et les force-pushs. Les règles attendues
sont versionnées dans [`.github/REPOSITORY_SETTINGS.md`](.github/REPOSITORY_SETTINGS.md).
Elles exigent notamment une pull request, une revue code owner, la résolution
des conversations et ces checks :

- `CI / Tests & typecheck` ;
- `CI / Audit des dépendances` ;
- `DCO / Developer Certificate of Origin`.

Les administrateurs suivent les mêmes règles, hors intervention d'urgence
documentée. Les branches sont supprimées après fusion et seul le squash merge
est autorisé.

## Labels et triage

Les formulaires posent `bug` ou `enhancement`. `documentation`, `dependencies`
et `security` décrivent le domaine ; `needs reproduction` indique qu'un bug ne
peut pas encore être confirmé ; `breaking change` signale une incompatibilité ;
`status: blocked` rend une dépendance explicite. `good first issue` et
`help wanted` ne sont posés que si le périmètre et les critères d'acceptation
sont suffisamment précis pour une contribution externe.

## Dépendances

Dependabot propose chaque semaine les mises à jour npm des applications web et
desktop, et chaque mois celles des GitHub Actions. Une dépendance n'est ajoutée
que si sa nécessité, sa maintenance, sa provenance et sa licence sont
compatibles avec [docs/licensing.md](docs/licensing.md). Les mises à jour
majeures ne sont jamais fusionnées automatiquement. Toute mise à jour passe par
la CI et l'audit high/critical des trois lockfiles ; une alerte exploitable est
priorisée selon son impact réel et peut suivre le canal privé de sécurité.
