# Releases publiques

Ce document est le contrat de release du **cœur public** de minddy.
`npm run deploy` est l'entrée unique pour le mainteneur : son assistant choisit
et orchestre les opérations ci-dessous. Les workflows et scripts spécialisés
restent séparés en interne pour être rejouables par la CI, mais il n'est pas
nécessaire de les lancer un par un.

### Cœur et Cloud, concrètement

Le **cœur minddy** est le produit distribuable : code source, migrations,
application Next.js et coquille desktop. Une release du cœur crée une version
publique durable (`v0.10.0`) que n'importe quel opérateur peut télécharger et
installer. Elle ne modifie pas, à elle seule, le site utilisé par nos clients.

**Minddy Cloud** est notre instance en fonctionnement sur `www.minddy.app` : le
même cœur, configuré avec notre Supabase, nos domaines, nos services optionnels
et notre hébergement Vercel. Le déployer change ce que les utilisateurs voient
en production. Il peut être déployé plusieurs fois entre deux releases du cœur.
Les pages marketing vivent dans le même build web : les publier est donc un
déploiement Cloud, mais un changement marketing seul ne mérite pas une nouvelle
version du produit.

## Les trois cadences

| Périmètre | Identifiant | Déclencheur | Artefact ou preuve |
| --- | --- | --- | --- |
| Cœur public | SemVer `X.Y.Z`, tag annoté `vX.Y.Z` | workflow `Public core release`, sur le SHA de `production` | source, migrations, manifeste, notes, checksums et attestations GitHub |
| Minddy Cloud | SHA Git + identifiant immuable du déploiement Vercel | workflow `Promote production`, après CI verte et approbation | SHA identique sur `main` et `production`, URL et statut du GitHub Deployment Vercel |
| Site marketing | SHA Git + identifiant du déploiement | pipeline d'hébergement du site | déploiement ; aucun bump ou tag du cœur si seul le contenu marketing change |

Le dépôt reste simple : les contributions convergent sur `main`, les branches
de travail passent par pull request, et `production` désigne uniquement ce que
sert Minddy Cloud. Il n'existe pas de branche de release longue durée. Un
correctif d'une ancienne majeure part exceptionnellement d'une branche
`release/X.x`, puis reçoit un tag SemVer normal.

## Versionnement et changelog

Le cœur suit SemVer :

- **patch** : correction compatible, durcissement ou migration additive sans
  changement de contrat public ;
- **minor** : fonctionnalité compatible, nouvelle variable optionnelle ou
  migration additive qui demande une action documentée ;
- **major** : rupture d'API/configuration, suppression annoncée ou migration de
  données incompatible avec l'ancienne application.

`CHANGELOG.md` ne décrit que le cœur et sa coquille desktop publique. Chaque PR
visible pour les utilisateurs ajoute une entrée sous `Unreleased` dans
`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed` ou `Security`. Les détails
d'exploitation Cloud et les changements purement marketing restent dans leurs
journaux respectifs.

## La commande unique

Depuis un `main` propre :

```bash
npm run deploy
```

L'assistant affiche ce qu'il a détecté depuis le dernier tag et depuis
`production`, puis propose :

1. **Recommandation automatique** : sélection fondée sur les fichiers modifiés ;
2. **Tout publier directement** : cœur + web Cloud + macOS ;
3. **Choisir périmètre par périmètre** ;
4. annuler.

En mode automatique :

- des fichiers produit/API/migrations/docs suggèrent une release du cœur ;
- tout commit absent de `production` suggère le déploiement web ;
- les chemins marketing sont signalés et n'entraînent pas seuls une release du
  cœur ;
- macOS n'est suggéré que si l'empreinte réelle de la coquille diffère de la
  dernière publication.

Si le cœur est sélectionné, l'assistant demande patch/minor/major ou une version
explicite. Il met à jour les quatre manifests/lockfiles et le changelog, crée le
commit signé DCO, pousse `main` et attend sa CI distante. Il déclenche ensuite
`Promote production`, qui attend l'approbation de l'environnement
`cloud-production`, revérifie la CI réussie du SHA exact, refuse toute divergence
et avance `production` en fast-forward. Le workflow attend le GitHub Deployment
Vercel `Production` au statut `success`. Il n'utilise aucun token Vercel local.

Une release du cœur implique cette promotion Cloud : le tag public ne peut être
créé que sur un commit réellement déployé. Après la promotion, l'assistant lance
`Public core release` sur `production` avec la version et le SHA immuable. Le
workflow `scripts/release-policy.mjs` refuse une ref différente, un checkout
différent ou une tête `production` différente. Une version préparée mais restée
sans tag après un échec est détectée et proposée à nouveau, sans second bump.

Les variantes scriptables sont `npm run deploy -- auto`, `-- all` et
`-- custom`. Même « all » conserve les contrôles et la question de version :
« direct » signifie un seul parcours, pas un contournement de la CI.

Le poste ne charge jamais `.env` et ne fabrique aucun artefact de confiance. Il
ne fait qu'un test rapide des scripts de release avant de préparer la demande ;
les lint, typecheck, tests, audit, build web, artefacts, signature et notarisation
tournent dans des runners jetables. Les secrets de production restent dans les
environnements GitHub ou dans l'intégration Vercel de l'organisation.

En interne, `scripts/prepare-release.mjs` refuse une version non SemVer, un tag
existant ou un `Unreleased` vide. Le workflow public refait la barrière du dépôt,
l'installation figée, lint, typecheck, bundle desktop, tests, audit et un vrai
`next build` sans secret. Il génère et atteste les artefacts avant de créer le
tag : une erreur ne laisse donc pas de demi-release.

## Artefacts du cœur

`scripts/build-release-artifacts.mjs` fabrique dans `.release/` :

- `minddy-vX.Y.Z-source.tar.gz`, archive déterministe du commit ;
- `minddy-vX.Y.Z-migrations.tar.gz`, migrations, bootstrap et runbooks utiles à
  l'installation ou à la mise à jour ;
- `release-manifest.json`, qui lie version, tag, SHA, release précédente,
  migrations ajoutées et hashes des archives ;
- `UPDATE.md` et les notes extraites du changelog ;
- `SHA256SUMS`.

GitHub fournit aussi ses archives automatiques du tag. Le workflow ajoute une
attestation de provenance sans clé longue durée grâce à l'identité OIDC du
runner. Après téléchargement :

```bash
shasum -a 256 -c SHA256SUMS
gh attestation verify minddy-v0.10.0-source.tar.gz --repo mangue-dev/minddy-issues
```

Un « build reproductible » signifie ici que la recette, les versions Node/pnpm,
le lockfile et les contrôles vivent dans GitHub Actions et tournent dans un
runner vierge. Les archives source sont bit-à-bit reproductibles pour un même
commit (`git archive` + `gzip -n`). Le build Next vérifie l'application web ; le
binaire déployé reste propre à l'environnement, car les variables
`NEXT_PUBLIC_*` font partie du build. Minddy Cloud enregistre donc son SHA et
son identifiant Vercel au lieu de présenter son build configuré comme un
artefact générique auto-hébergeable.

Après chaque déploiement Cloud réussi, l'opérateur enregistre dans le dépôt
privé `mangue-dev/minddy-cloud-ops` un manifeste de provenance immuable : SHA et
version de ce cœur, arbre et tête des migrations, SHA de configuration privée,
empreintes du contrat/configuration, identifiant du déploiement Vercel et projet
Supabase. Le manifeste ne contient ni valeur d'environnement ni donnée client.
Le workflow public s'arrête au verdict Vercel et ne clone jamais le dépôt privé :
ce journal complète la preuve d'exploitation sans devenir une dépendance du cœur.

## Migrations, mise à jour et rollback

Le manifeste et `UPDATE.md` énumèrent le diff de migrations depuis le tag
précédent. L'archive livre aussi l'historique complet, nécessaire au bootstrap.
La procédure opérationnelle de référence reste
[`self-hosting-operations.md`](self-hosting-operations.md) : sauvegarde
coordonnée Postgres + Storage, arrêt des écritures, migrations avant nouvelle
application, vérification, puis réouverture.

Les migrations sont forward-only. Avant leur application, revenir au tag
précédent suffit. Après une migration déclarée compatible en arrière, l'ancien
code peut être redémarré pendant la fenêtre documentée. Dans tous les autres
cas, le rollback est la restauration **du même ensemble** Postgres, Storage,
configuration et version applicative. Ne jamais inventer un `down.sql` pendant
l'incident.

### Hotfix Cloud

Une urgence suit le même chemin simple que toute correction Cloud :

1. créer la correction depuis la tête de `main`, avec test de non-régression ;
2. committer la correction sur `main`, puis lancer `npm run deploy` ;
3. vérifier le SHA de `production` et le déploiement Vercel associé.

Ne jamais corriger uniquement `production`, même temporairement : le prochain
fast-forward perdrait le correctif et rendrait l'état servi impossible à
reproduire depuis `main`.

### Rollback Cloud sans réécriture

Retrouver le `STABLE_SHA` dans le dernier déploiement Vercel réussi. Ne pas
forcer `production` vers cet ancien commit. Restaurer son arbre sur le `main`
courant, puis produire un **nouveau** commit de rollback :

```bash
git fetch origin main
git switch main
git merge --ff-only origin/main
git restore --source "$STABLE_SHA" --staged --worktree -- .
git commit -s -m "revert(cloud): restore $STABLE_SHA"
npm run deploy -- custom
```

Vérifier avant déploiement la compatibilité avec les migrations déjà appliquées :
elles restent forward-only et ne sont jamais annulées par cette restauration de
code. Dans le menu, sélectionner uniquement le web Cloud. Le nouveau commit est
poussé sur `main`, testé, puis `production` pointe sur ce même SHA par
fast-forward. Son arbre applicatif restaure la version stable sans réécrire
l'historique. La correction de fond part ensuite de ce `main` restauré et reçoit
un nouveau déploiement ; elle ne vit jamais seulement sur `production`.

## App macOS publique

Le desktop ne reçoit pas automatiquement chaque version du cœur : c'est une
fenêtre sur le web, et une modification web ne change pas la coquille. Quand
`npm run desktop:check` montre une empreinte différente, lancer **Public macOS
release** avec une version du cœur déjà publiée. Le workflow reconstruit sur
`macos-26`, signe, notarise, agrafe le ticket, vérifie le flux de mise à jour,
ajoute ses checksums et attestations, puis attache `.dmg`, `.zip`, blockmaps et
`latest-mac.yml` à la release existante.

Les secrets suivants appartiennent à l'environnement GitHub
`public-release`, pas à un compte ou un trousseau personnel :

- `MACOS_CERTIFICATE_P12_BASE64` et `MACOS_CERTIFICATE_PASSWORD` ;
- `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID` et `APPLE_API_ISSUER` ;
- `PUBLIC_DESKTOP_FEED_URL` et `PUBLIC_DESKTOP_BLOB_READ_WRITE_TOKEN` pour le
  flux générique stable d'electron-updater.

Le rôle doit être transmissible à un autre mainteneur et les secrets doivent
être rotatifs. Le workflow attache les binaires immuables à GitHub Releases et
met à jour le manifeste du flux générique **en dernier**, après les binaires.
Le stockage peut être Vercel Blob comme dans
[`desktop-release.md`](desktop-release.md), mais ses identifiants sont ceux de
l'organisation et la publication est exécutée par la CI.

## Approbations et réglages GitHub

- `cloud-production` protège `Promote production` avec les mainteneurs requis ;
  lui seul peut avancer `production` avec le `GITHUB_TOKEN` éphémère ;
- `public-release` protège le tag, GitHub Release et les secrets Apple ;
- `production` interdit force-push et suppression. Son seul acteur d'écriture
  autorisé est le workflow de promotion ;
- l'intégration Git Vercel doit publier un GitHub Deployment nommé exactement
  `Production`, faute de quoi la promotion finit en échec même si la branche a
  avancé. Après relance du déploiement Vercel, rejouer la commande vérifie le
  même SHA et reprend l'attente.

L'approbation explicite se fait dans l'interface GitHub pendant que
`npm run deploy` attend. Elle est journalisée avec le run, le SHA demandé et le
verdict Vercel. Les réglages reproductibles sont listés dans
`.github/REPOSITORY_SETTINGS.md`.

## Échec et reprise

- Avant création du tag : corriger le commit ou la configuration, puis relancer.
- Tag poussé mais release absente : ne pas déplacer le tag ; créer la release à
  partir des artefacts conservés par le workflow, ou publier un patch si le
  contenu est faux.
- Release publiée : elle est immuable. Une correction donne une nouvelle
  version ; les assets ne sont pas remplacés silencieusement.
- Déploiement Cloud en échec : suivre le rollback Vercel/base du runbook. Ne pas
  supprimer une release publique correcte pour refléter un incident Cloud.
