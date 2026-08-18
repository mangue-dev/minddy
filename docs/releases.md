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
| Cœur public | SemVer `X.Y.Z`, tag annoté `vX.Y.Z` | workflow `Public core release`, depuis `main` vert | source, migrations, manifeste, notes, checksums et attestations GitHub |
| Minddy Cloud | SHA Git + identifiant immuable du déploiement Vercel | `npm run deploy`, branche `production` | déploiement Vercel et journal d'exploitation privé |
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
commit signé DCO, pousse `main`, attend sa CI, lance la release publique et
attend son résultat. Il déploie ensuite le web sélectionné, puis macOS. Une
version préparée mais restée sans tag après un échec est détectée et proposée à
nouveau, sans second bump.

Les variantes scriptables sont `npm run deploy -- auto`, `-- all` et
`-- custom`. Même « all » conserve les contrôles et la question de version :
« direct » signifie un seul parcours, pas un contournement de la CI.

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

## Échec et reprise

- Avant création du tag : corriger le commit ou la configuration, puis relancer.
- Tag poussé mais release absente : ne pas déplacer le tag ; créer la release à
  partir des artefacts conservés par le workflow, ou publier un patch si le
  contenu est faux.
- Release publiée : elle est immuable. Une correction donne une nouvelle
  version ; les assets ne sont pas remplacés silencieusement.
- Déploiement Cloud en échec : suivre le rollback Vercel/base du runbook. Ne pas
  supprimer une release publique correcte pour refléter un incident Cloud.
