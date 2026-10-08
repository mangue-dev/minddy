---
{
  "id": "self-hosted-compatibility",
  "locale": "fr",
  "title": "Choisir une version et un profil d’installation pris en charge",
  "summary": "Utilisez une version immuable du dépôt public mangue-dev/minddy.",
  "topic": "Exploiter une instance",
  "type": "reference",
  "audiences": [
    "operator"
  ],
  "workflows": [
    "H01"
  ],
  "visibility": "public",
  "status": "published",
  "revision": 1,
  "sourceRevision": 1,
  "owner": "@mangue-dev",
  "updatedAt": "2026-10-08",
  "compatibility": {
    "version": "0.11.1 candidate (89ebb59a5)",
    "editions": [
      "self-hosted"
    ],
    "profiles": [
      "full",
      "managed",
      "source",
      "local"
    ],
    "evidence": [
      "deploy/self-hosted/compatibility.json",
      "docs/container-image.md",
      "docs/self-hosting-distribution.md",
      "content/documentation/reviews/operator-large-runner-write.json",
      "content/documentation/reviews/operator-sandbox-network.json"
    ]
  },
  "review": {
    "revision": 1,
    "fact": "agent:/root/automation_account_documentation (independent targeted primary-source review)",
    "language": "agent:/root/automation_account_documentation (complete independent article and caption review)",
    "date": "2026-10-08"
  },
  "related": [
    "install-a-server",
    "managed-or-source-installation"
  ],
  "aliases": [],
  "tags": [],
  "figures": [
    {
      "id": "self-hosted-compatibility-flow",
      "kind": "diagram",
      "src": "/documentation/fr/self-hosted-compatibility-flow.svg",
      "alt": "Schéma: Tag source annoté. Assets et SHA256SUMS. Signature et digest OCI officiels. Profil de compatibilité choisi.",
      "caption": "Lisez les étapes dans cet ordre. Tag source annoté. Assets et SHA256SUMS. Signature et digest OCI officiels. Profil de compatibilité choisi.",
      "revision": 1,
      "reviewed": true,
      "capturedAt": "2026-10-08",
      "viewport": [
        720,
        640
      ],
      "theme": "neutral"
    }
  ],
  "requiredFigures": [
    "self-hosted-compatibility-flow"
  ]
}
---

## Choisir une version et un profil d’installation pris en charge {#self-hosted-compatibility}

Utilisez une version immuable du dépôt public mangue-dev/minddy. La ligne de compatibilité v0.11.0 prend en charge les serveurs Linux amd64 et arm64, Node.js 24, pnpm 10.28.0, Docker Engine à partir de 27.0.0 et le plugin Compose à partir de 2.29.0. Le profil full utilise Supabase officiel self-hosted/v0.7.2, au commit 549db119c44c25167461812041ba198bde2b31a4. Conservez l’ensemble de ses images : mettre à jour un service isolément produit une variante gérée par l’opérateur.

Le profil managed se connecte à un projet Supabase sur supabase.com. Celui-ci doit fournir PostgreSQL, Auth, Storage et Realtime et réussir la vérification de la version. PostgreSQL seul ne suffit pas. La pile locale de la CLI Supabase sert au développement et à l’évaluation, pas à un service public de production.


![Schéma: Tag source annoté. Assets et SHA256SUMS. Signature et digest OCI officiels. Profil de compatibilité choisi.](/documentation/fr/self-hosted-compatibility-flow.svg)

## Vérifier la release {#verify-release}

Vérifiez le tag annoté, les fichiers de la release, SHA256SUMS et la signature OCI officielle avant d’installer des dépendances ou d’exécuter la version. Les commandes Bash suivantes partent du dépôt positionné sur le tag choisi et définissent IMAGE avec le digest vérifié. Arrêtez-vous dès qu’un contrôle échoue. Installez d’abord Cosign en suivant ses instructions officielles. Ce contrôle établit l’identité du code et de l’image, pas le bon fonctionnement du déploiement.

```bash
set -euo pipefail
export SOURCE_DIR="$PWD"
export RELEASE_TAG="$(git describe --tags --exact-match)"
git rev-parse "$RELEASE_TAG^{tag}"
export RELEASE_ASSETS="$(mktemp -d)"
ASSET_BASE="https://github.com/mangue-dev/minddy/releases/download/$RELEASE_TAG"
for ASSET in SHA256SUMS RELEASE_NOTES.md UPDATE.md release-manifest.json \
  "minddy-$RELEASE_TAG-container.txt" "minddy-$RELEASE_TAG-source.tar.gz" \
  "minddy-$RELEASE_TAG-migrations.tar.gz"; do
  curl --fail --show-error --location "$ASSET_BASE/$ASSET" --output "$RELEASE_ASSETS/$ASSET"
done
cd "$RELEASE_ASSETS"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum --check SHA256SUMS
else
  shasum -a 256 --check SHA256SUMS
fi
test "$(node -p 'require("./release-manifest.json").release.tag')" = "$RELEASE_TAG"
test "$(node -p 'require("./release-manifest.json").release.commit')" = \
  "$(git -C "$SOURCE_DIR" rev-parse "$RELEASE_TAG^{commit}")"
export IMAGE="$(node -p 'require("./release-manifest.json").container.reference')"
test "$IMAGE" = "$(sed -n 's/^reference=//p' "minddy-$RELEASE_TAG-container.txt")"
printf '%s\n' "$IMAGE" | LC_ALL=C grep -Eq '^ghcr\.io/mangue-dev/minddy@sha256:[a-f0-9]{64}$'
cosign verify \
  --certificate-identity 'https://github.com/mangue-dev/minddy/.github/workflows/release.yml@refs/heads/production' \
  --certificate-oidc-issuer 'https://token.actions.githubusercontent.com' \
  "$IMAGE"
cd "$SOURCE_DIR"
```

```bash
gh attestation verify "oci://$IMAGE" --repo mangue-dev/minddy
docker buildx imagetools inspect "$IMAGE" \
  --format '{{ json .SBOM }}' > minddy.sbom.spdx.json
test -s minddy.sbom.spdx.json
```

## Préparer exploitation et mises à jour {#support}

Installez les versions publiées une par une. Les migrations vont uniquement vers l’avant ; un retour incompatible restaure ensemble la base, Storage, la configuration et l’application correspondantes. Minddy maintient les outils de release et aide au diagnostic des défauts reproductibles du cœur, sans garantie de résultat. Vous gérez DNS, TLS, capacité, sauvegardes, exercices de restauration et fournisseurs optionnels. Un tag d’image mouvant ou une pile Supabase dérivée ne bénéficie pas du contrat de support de la release.

## Limites du runner dans la version publiée {#known-runner-limits}

Le runner publié dans v0.11.0 présente d’autres blocages de l’exécution de code : il refuse les noms de sandbox contenant le suffixe d’allocation, écrit des fragments base64 trop grands pour une seule valeur d’environnement Linux et initialise en root un stockage temporaire appartenant à UID 10001, de mode 0700, après suppression de toutes les capacités. Cette dernière commande peut échouer sans que son résultat soit contrôlé, laissant le répertoire de travail absent. Un endpoint runner sain ne valide donc ni le clonage ni l’exécution de code. Le candidat courant corrige ces chemins ; la répétition jetable a utilisé le runner et son helper de stockage actuels par des montages explicites en lecture seule sur l’image v0.11.0. Cela ne crée ni image publiée corrigée ni nouvelle ligne de compatibilité prise en charge. Obtenez une combinaison de release et d’outils corrigée, puis vérifiez le parcours de travail sur le code avant d’activer ces agents pour une équipe.

Le relais Git de v0.11.0 omet aussi le challenge HTTP Basic, ce qui empêche un client Git ordinaire d’envoyer ses identifiants. Le [contournement technique épinglé](/fr/documentation/install-a-server#runner-workaround) fournit les fichiers correspondants du runner et leurs empreintes ; il ne modifie pas l’image publiée et ne crée pas de version prise en charge.

L’image publiée de l’application inclut Node.js et Git, mais retire volontairement npm, npx et Corepack. Le profil Compose de référence choisit aussi cette image pour les workers via AGENT_RUNNER_SANDBOX_IMAGE=MINDDY_IMAGE. Cela ne suffit pas pour un nouveau worker de code : le bootstrap OpenCode utilise npm pour installer son runtime et son plugin épinglés, même dans un dépôt sans dépendances de projet. Sans npm, l’exécution s’arrête au bootstrap ; la conversation ne permet pas de conclure qu’un fichier du projet a été modifié ou qu’un test a réussi. Utilisez une image dédiée aux workers, construite et vérifiée par l’opérateur, avec Node.js 24, npm, Git et les outils nécessaires au projet, en surchargeant AGENT_RUNNER_SANDBOX_IMAGE dans le service runner. Conservez les contraintes d’isolation du runner. Vérifiez le bootstrap, le clonage, les véritables tests et le diff obtenu avant d’autoriser la délégation de code. Corriger les fichiers du runner ne fournit pas cette chaîne d’outils au worker.

Le helper de stockage épinglé rend aussi l’espace de travail de la sandbox exécutable. Docker monte sinon ce tmpfs avec noexec, ce qui empêche le démarrage du binaire natif OpenCode et peut faire apparaître une erreur trompeuse de repli vers un paquet musl. La correction conserve nosuid, nodev, les UID/GID 10001, le mode 0700, la racine en lecture seule, les capabilities retirées et le stockage jetable propre à chaque sandbox. Elle ne rend pas les données de l’hôte exécutables et ne transforme pas l’image de l’application en image worker adaptée.
