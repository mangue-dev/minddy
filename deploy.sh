#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
Usage: npm run deploy [-- auto|all|custom]

Assistant unique de publication minddy.

  auto    recommande les périmètres d'après les fichiers modifiés
  all     publie le cœur, déploie le web et publie macOS
  custom  pose une question pour chaque périmètre

Sans argument, un menu interactif propose ces trois modes.

Périmètres :
  cœur public  version SemVer + tag + GitHub Release + artefacts
  web Cloud    instance www.minddy.app déployée depuis `production`
  macOS        app signée/notarisée attachée à la release du cœur

Le marketing fait partie du build web : un changement marketing seul suggère
le déploiement Cloud, sans créer artificiellement une version du cœur.
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

MODE="${1:-}"
if [ "$#" -gt 1 ] || { [ -n "$MODE" ] && [ "$MODE" != "auto" ] && [ "$MODE" != "all" ] && [ "$MODE" != "custom" ]; }; then
  usage
  exit 1
fi

CURRENT=$(git branch --show-current)
if [ -z "$CURRENT" ]; then
  echo "Error: detached HEAD. Checkout main first."
  exit 1
fi
if [ "$CURRENT" != "main" ]; then
  echo "Error: run deploy from main (current: $CURRENT)."
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: the working tree must be clean before a release or deploy."
  git status --short
  exit 1
fi

echo "→ Refreshing main, production and release tags..."
git fetch origin main production --tags
if ! git show-ref --verify --quiet refs/remotes/origin/production; then
  echo "Error: origin/production does not exist."
  exit 1
fi
if [ "$CURRENT" = "main" ]; then
  git merge --ff-only origin/main
fi

SCOPE=$(node scripts/release-scope.mjs)
json_value() {
  node -e 'const value=JSON.parse(process.argv[1]); console.log(value[process.argv[2]])' "$SCOPE" "$1"
}
json_count() {
  node -e 'const value=JSON.parse(process.argv[1]); console.log(value[process.argv[2]].length)' "$SCOPE" "$1"
}

AUTO_CORE=$(json_value core)
AUTO_WEB=$(json_value web)
AUTO_DESKTOP=$(json_value desktop)
MARKETING=$(json_value marketing)
CORE_COUNT=$(json_count coreFiles)
WEB_COUNT=$(json_count webFiles)
MARKETING_COUNT=$(json_count marketingFiles)

echo ""
echo "Détection automatique :"
echo "  cœur public : $AUTO_CORE ($CORE_COUNT fichiers depuis le dernier tag)"
echo "  web Cloud   : $AUTO_WEB ($WEB_COUNT fichiers depuis production)"
echo "  macOS       : $AUTO_DESKTOP (empreinte de la coquille)"
if [ "$MARKETING" = "true" ]; then
  echo "  marketing   : $MARKETING_COUNT fichiers — inclus dans le déploiement web"
fi

if [ -z "$MODE" ]; then
  if [ ! -t 0 ]; then
    MODE="auto"
  else
    echo ""
    echo "Que veux-tu faire ?"
    echo "  1) Recommandation automatique"
    echo "  2) Tout publier directement"
    echo "  3) Choisir périmètre par périmètre"
    echo "  4) Annuler"
    read -r -p "Choix [1-4] : " MENU_CHOICE
    case "$MENU_CHOICE" in
      1) MODE="auto" ;;
      2) MODE="all" ;;
      3) MODE="custom" ;;
      4) echo "Annulé."; exit 0 ;;
      *) echo "Choix invalide."; exit 1 ;;
    esac
  fi
fi

CORE=0
WEB=0
DESKTOP=0

yes_no() {
  local prompt="$1"
  local default="$2"
  local suffix="[y/N]"
  [ "$default" = "yes" ] && suffix="[Y/n]"
  read -r -p "$prompt $suffix : " answer
  if [ -z "$answer" ]; then
    [ "$default" = "yes" ]
  else
    case "$answer" in y|Y|yes|YES|o|O|oui|OUI) return 0 ;; *) return 1 ;; esac
  fi
}

case "$MODE" in
  auto|all) ;;
  custom)
    if yes_no "Publier une nouvelle version du cœur public ?" "$([ "$AUTO_CORE" = "true" ] && echo yes || echo no)"; then CORE=1; fi
    if yes_no "Déployer le web Minddy Cloud (marketing inclus) ?" "$([ "$AUTO_WEB" = "true" ] && echo yes || echo no)"; then WEB=1; fi
    if yes_no "Construire et publier l'app macOS ?" "$([ "$AUTO_DESKTOP" = "true" ] && echo yes || echo no)"; then DESKTOP=1; fi
    ;;
esac

SELECTION=$(node -e '
  import("./scripts/release-scope.mjs").then(({ selectReleaseScopes }) => {
    const detected = JSON.parse(process.argv[1]);
    const custom = { core: process.argv[3] === "1", web: process.argv[4] === "1", desktop: process.argv[5] === "1" };
    process.stdout.write(JSON.stringify(selectReleaseScopes(process.argv[2], detected, custom)));
  });
' "$SCOPE" "$MODE" "$CORE" "$WEB" "$DESKTOP")
CORE=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).core ? "1" : "0")' "$SELECTION")
WEB=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).web ? "1" : "0")' "$SELECTION")
DESKTOP=$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).desktop ? "1" : "0")' "$SELECTION")

if [ "$CORE" -eq 0 ] && [ "$WEB" -eq 0 ] && [ "$DESKTOP" -eq 0 ]; then
  echo "Rien à publier d'après ce choix."
  exit 0
fi

echo ""
echo "Publication retenue : cœur=$CORE · web=$WEB · macOS=$DESKTOP"

require_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "Error: GitHub CLI (gh) is required for public core or macOS releases."
    exit 1
  fi
  if ! gh auth status >/dev/null 2>&1; then
    echo "Error: gh is not authenticated. Run: gh auth login"
    exit 1
  fi
}

wait_for_run() {
  local workflow="$1"
  local sha="$2"
  local event="${3:-}"
  local branch="${4:-}"
  local run_id=""
  local attempt
  for attempt in $(seq 1 60); do
    local args=(run list --workflow "$workflow" --commit "$sha" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
    [ -n "$event" ] && args+=(--event "$event")
    [ -n "$branch" ] && args+=(--branch "$branch")
    run_id=$(gh "${args[@]}")
    [ -n "$run_id" ] && break
    sleep 5
  done
  if [ -z "$run_id" ]; then
    echo "Error: workflow $workflow did not start for $sha."
    exit 1
  fi
  gh run watch "$run_id" --exit-status
}

dispatch_and_wait() {
  local workflow="$1"
  local ref="$2"
  local sha="$3"
  shift 3
  local previous_run
  local run_id=""
  local attempt
  previous_run=$(gh run list --workflow "$workflow" --commit "$sha" --event workflow_dispatch --branch "$ref" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
  gh workflow run "$workflow" --ref "$ref" "$@"
  for attempt in $(seq 1 60); do
    run_id=$(gh run list --workflow "$workflow" --commit "$sha" --event workflow_dispatch --branch "$ref" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
    [ -n "$run_id" ] && [ "$run_id" != "$previous_run" ] && break
    sleep 5
  done
  if [ -z "$run_id" ] || [ "$run_id" = "$previous_run" ]; then
    echo "Error: the new $workflow run did not start for $sha."
    exit 1
  fi
  gh run watch "$run_id" --exit-status
}

TARGET_VERSION=""
REUSE_PREPARED=0
if [ "$CORE" -eq 1 ]; then
  require_gh
  if [ "$CURRENT" != "main" ]; then
    echo "Error: a public core release must be prepared from main (current: $CURRENT)."
    exit 1
  fi
  CURRENT_VERSION=$(node -p "require('./package.json').version")
  PREPARED=0
  if [ -z "$(git tag --list "v$CURRENT_VERSION")" ] && node -e 'import("./scripts/release-lib.mjs").then(({changelogSection}) => changelogSection(require("node:fs").readFileSync("CHANGELOG.md", "utf8"), process.argv[1]))' "$CURRENT_VERSION" >/dev/null 2>&1; then
    PREPARED=1
  fi
  if [ "$PREPARED" -eq 1 ] && yes_no "La version $CURRENT_VERSION est préparée mais pas publiée. La reprendre ?" yes; then
    TARGET_VERSION="$CURRENT_VERSION"
    REUSE_PREPARED=1
  else
    IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$CURRENT_VERSION"
    echo ""
    echo "Version actuelle : $CURRENT_VERSION"
    echo "  1) patch → $V_MAJOR.$V_MINOR.$((V_PATCH + 1))"
    echo "  2) minor → $V_MAJOR.$((V_MINOR + 1)).0"
    echo "  3) major → $((V_MAJOR + 1)).0.0"
    echo "  4) saisir une version"
    read -r -p "Nouvelle version [1-4] : " VERSION_CHOICE
    case "$VERSION_CHOICE" in
      1) TARGET_VERSION="$V_MAJOR.$V_MINOR.$((V_PATCH + 1))" ;;
      2) TARGET_VERSION="$V_MAJOR.$((V_MINOR + 1)).0" ;;
      3) TARGET_VERSION="$((V_MAJOR + 1)).0.0" ;;
      4) read -r -p "Version SemVer : " TARGET_VERSION ;;
      *) echo "Choix invalide."; exit 1 ;;
    esac
  fi
  node -e 'import("./scripts/release-lib.mjs").then(({assertVersion}) => assertVersion(process.argv[1]))' "$TARGET_VERSION"
fi

if [ "$DESKTOP" -eq 1 ]; then
  require_gh
fi

# Contrôle rapide du mécanisme local qui prépare la demande. Les gates de
# confiance tournent dans CI sur le SHA poussé ; ce poste n'en est pas la source.
echo "→ Checking release tooling..."
npm run test:release

if [ "$CORE" -eq 1 ]; then
  if [ "$REUSE_PREPARED" -eq 0 ]; then
    echo "→ Preparing public core v$TARGET_VERSION..."
    npm run release:prepare -- "$TARGET_VERSION"
    git add package.json package-lock.json desktop/package.json desktop/package-lock.json CHANGELOG.md
    git commit -s -m "chore: prepare release $TARGET_VERSION"
  fi
fi

DEPLOYED_SHA=""
if [ "$CORE" -eq 1 ] || [ "$WEB" -eq 1 ]; then
  require_gh
  git push origin main
  DEPLOYED_SHA=$(git rev-parse HEAD)
  echo "→ Waiting for main CI on $(git rev-parse --short HEAD)..."
  wait_for_run ci.yml "$DEPLOYED_SHA" push main

  echo "→ Requesting protected promotion and Cloud deployment..."
  dispatch_and_wait promote-production.yml main "$DEPLOYED_SHA" -f sha="$DEPLOYED_SHA"
  git fetch origin production
  if [ "$(git rev-parse origin/production)" != "$DEPLOYED_SHA" ]; then
    echo "Error: production does not point to the verified SHA $DEPLOYED_SHA."
    exit 1
  fi
fi

if [ "$CORE" -eq 1 ]; then
  echo "→ Publishing public core v$TARGET_VERSION from production..."
  dispatch_and_wait release.yml production "$DEPLOYED_SHA" -f version="$TARGET_VERSION" -f sha="$DEPLOYED_SHA"
fi

if [ "$DESKTOP" -eq 1 ]; then
  DESKTOP_VERSION="${TARGET_VERSION:-$(node -p "require('./package.json').version")}"
  if ! gh release view "v$DESKTOP_VERSION" >/dev/null 2>&1; then
    echo "Error: the macOS app needs an existing public core release v$DESKTOP_VERSION."
    exit 1
  fi
  git fetch origin production
  DESKTOP_RUN_SHA=$(git rev-parse origin/production)
  echo "→ Publishing signed macOS app for v$DESKTOP_VERSION..."
  dispatch_and_wait desktop-release.yml production "$DESKTOP_RUN_SHA" -f version="$DESKTOP_VERSION"
  git pull --ff-only origin main
fi

echo ""
echo "✓ Publication terminée : cœur=$CORE · web=$WEB · macOS=$DESKTOP"
[ -n "$DEPLOYED_SHA" ] && echo "  production : $DEPLOYED_SHA"
[ -n "$TARGET_VERSION" ] && echo "  tag        : v$TARGET_VERSION → $DEPLOYED_SHA"
