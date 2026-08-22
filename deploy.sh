#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
Usage: npm run deploy [-- auto|all|custom|windows]

Minddy's single publishing assistant.

  auto    recommend scopes based on modified files
  all     publish the core, deploy the web app, and publish the desktop applications
  custom  ask a question for each scope
  windows publish only the existing version's Microsoft Store packages

With no argument, an interactive menu offers the automatic, all, and custom modes.

Scopes:
  public core  SemVer version + tag + GitHub Release + artifacts
  Cloud web    www.minddy.app instance deployed from `production`
  desktop      macOS, Linux, and Microsoft Store Windows packages attached to the core release
  windows      x64 and ARM64 Store MSIX packages, without macOS or Linux jobs

Marketing is part of the web build: a marketing-only change suggests
a Cloud deployment without artificially creating a core version.

When a required pentest is still pending, an interactive private-repository
test release can be explicitly accepted. For non-interactive use, set
MINDDY_PRIVATE_TEST_RELEASE=1 together with documented residual risks.
EOF
}

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  usage
  exit 0
fi

MODE="${1:-}"
if [ "$#" -gt 1 ] || { [ -n "$MODE" ] && [ "$MODE" != "auto" ] && [ "$MODE" != "all" ] && [ "$MODE" != "custom" ] && [ "$MODE" != "windows" ]; }; then
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
echo "Automatic detection:"
echo "public core: $AUTO_CORE ($CORE_COUNT files since the last tag)"
echo "  Cloud web   : $AUTO_WEB ($WEB_COUNT files since production)"
echo "desktop: $AUTO_DESKTOP (shell fingerprint)"
if [ "$MARKETING" = "true" ]; then
  echo "marketing: $MARKETING_COUNT files — included in web deployment"
fi

if [ -z "$MODE" ]; then
  if [ ! -t 0 ]; then
    MODE="auto"
  else
    echo ""
    echo "What would you like to do?"
    echo "  1) Automatic recommendation"
    echo "  2) Publish everything directly"
    echo "3) Choose perimeter by perimeter"
    echo "4) Cancel"
    read -r -p "Choice [1-4]: " MENU_CHOICE
    case "$MENU_CHOICE" in
      1) MODE="auto" ;;
      2) MODE="all" ;;
      3) MODE="custom" ;;
      4) echo "Canceled."; exit 0 ;;
      *) echo "Invalid choice."; exit 1 ;;
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
  auto|all|windows) ;;
  custom)
    if yes_no "Publish a new version of the public heart?" "$([ "$AUTO_CORE" = "true" ] && echo yes || echo no)"; then CORE=1; fi
    if yes_no "Deploy the Minddy Cloud web (marketing included)?" "$([ "$AUTO_WEB" = "true" ] && echo yes || echo no)"; then WEB=1; fi
    if yes_no "Build and publish the desktop applications for macOS, Linux, and Windows?" "$([ "$AUTO_DESKTOP" = "true" ] && echo yes || echo no)"; then DESKTOP=1; fi
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
DESKTOP_TARGET="all"
[ "$MODE" = "windows" ] && DESKTOP_TARGET="windows"

if [ "$CORE" -eq 0 ] && [ "$WEB" -eq 0 ] && [ "$DESKTOP" -eq 0 ]; then
  echo "Nothing to publish based on this choice."
  exit 0
fi

echo ""
echo "Publication selected: core=$CORE · web=$WEB · desktop=$DESKTOP · desktop target=$DESKTOP_TARGET"

SECURITY_CHECKLIST_VERSION="1.0"
SECURITY_REVIEW_REF="${MINDDY_SECURITY_REVIEW_REF:-}"
RESIDUAL_RISKS="${MINDDY_RESIDUAL_RISKS:-}"
PENTEST_STATUS="${MINDDY_PENTEST_STATUS:-}"
PRIVATE_TEST_RELEASE="${MINDDY_PRIVATE_TEST_RELEASE:-0}"
if [ "$PRIVATE_TEST_RELEASE" != "0" ] && [ "$PRIVATE_TEST_RELEASE" != "1" ]; then
  echo "Error: MINDDY_PRIVATE_TEST_RELEASE must be 0 or 1."
  exit 1
fi

require_gh() {
  if ! command -v gh >/dev/null 2>&1; then
    echo "Error: GitHub CLI (gh) is required for public core or desktop releases."
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
  if [ -z "$(git tag --list "v$CURRENT_VERSION")" ]; then
    PREPARED=1
  fi
  if [ "$PREPARED" -eq 1 ] && yes_no "The $CURRENT_VERSION version is prepared but not published. Take it back?" yes; then
    TARGET_VERSION="$CURRENT_VERSION"
    REUSE_PREPARED=1
  else
    IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$CURRENT_VERSION"
    echo ""
    echo "Version actuelle : $CURRENT_VERSION"
    echo "  1) patch → $V_MAJOR.$V_MINOR.$((V_PATCH + 1))"
    echo "  2) minor → $V_MAJOR.$((V_MINOR + 1)).0"
    echo "  3) major → $((V_MAJOR + 1)).0.0"
    echo "4) enter a version"
    read -r -p "New version [1-4]: " VERSION_CHOICE
    case "$VERSION_CHOICE" in
      1) TARGET_VERSION="$V_MAJOR.$V_MINOR.$((V_PATCH + 1))" ;;
      2) TARGET_VERSION="$V_MAJOR.$((V_MINOR + 1)).0" ;;
      3) TARGET_VERSION="$((V_MAJOR + 1)).0.0" ;;
      4) read -r -p "Version SemVer : " TARGET_VERSION ;;
      *) echo "Invalid choice."; exit 1 ;;
    esac
  fi
  node -e 'import("./scripts/release-lib.mjs").then(({assertVersion}) => assertVersion(process.argv[1]))' "$TARGET_VERSION"
fi

if [ "$DESKTOP" -eq 1 ]; then
  require_gh
fi

# Quick check of the local mechanism that prepares the request. The gates of
# trust runs in CI on the pushed SHA; this post is not the source.
echo "→ Checking release tooling..."
npm run test:release

if [ "$CORE" -eq 1 ]; then
  if [ "$REUSE_PREPARED" -eq 0 ]; then
    echo "→ Preparing public core v$TARGET_VERSION..."
    npm run release:prepare -- "$TARGET_VERSION"
    git add package.json package-lock.json desktop/package.json desktop/package-lock.json
    git commit -s -m "chore: prepare release $TARGET_VERSION"
  fi
fi

# `release:prepare` creates the commit that will actually be promoted. The journal must therefore
# intervene after this preparation, but always before the push and the CI of
# candidate, so that his report can name the exact SHA.
if [ "$WEB" -eq 1 ]; then
  SECURITY_CANDIDATE_SHA=$(git rev-parse HEAD)
  echo ""
  echo "Mandatory security review for $SECURITY_CANDIDATE_SHA: docs/security-release-checklist.md (v$SECURITY_CHECKLIST_VERSION)"
  if [ -t 0 ]; then
    if [ -z "$SECURITY_REVIEW_REF" ]; then
      read -r -p "Stable reference of the report (URL or issue, without spaces):" SECURITY_REVIEW_REF
    fi
    if [ -z "$RESIDUAL_RISKS" ]; then
      if yes_no "Are any residual risks recorded in this report?" no; then
        RESIDUAL_RISKS="documented"
      else
        RESIDUAL_RISKS="none"
      fi
    fi
    if [ -z "$PENTEST_STATUS" ]; then
      echo "Pentest decision:"
      echo "1) not required according to checklist criteria"
      echo "2) required, completed and blocking findings retested"
      echo "3) required but not completed (promotion will be refused)"
      read -r -p "Choix [1-3] : " PENTEST_CHOICE
      case "$PENTEST_CHOICE" in
        1) PENTEST_STATUS="not-required" ;;
        2) PENTEST_STATUS="completed" ;;
        3) PENTEST_STATUS="required-not-completed" ;;
        *) echo "Invalid choice."; exit 1 ;;
      esac
    fi
    if [ "$PENTEST_STATUS" = "required-not-completed" ] && [ "$PRIVATE_TEST_RELEASE" = "0" ]; then
      echo ""
      echo "The required pentest is incomplete. This exception is only permitted"
      echo "for a documented test release while the GitHub repository is private."
      if yes_no "Continue with the private test release exception?" no; then
        PRIVATE_TEST_RELEASE="1"
      fi
    fi
  fi

  node scripts/release-security-policy.mjs \
    "$SECURITY_CHECKLIST_VERSION" \
    "$SECURITY_REVIEW_REF" \
    "$RESIDUAL_RISKS" \
    "$PENTEST_STATUS" \
    "$PRIVATE_TEST_RELEASE" >/dev/null
fi

DEPLOYED_SHA=""
if [ "$CORE" -eq 1 ] || [ "$WEB" -eq 1 ]; then
  require_gh
  git push origin main
  DEPLOYED_SHA=$(git rev-parse HEAD)
  echo "→ Waiting for main CI on $(git rev-parse --short HEAD)..."
  wait_for_run ci.yml "$DEPLOYED_SHA" push main

  echo "→ Requesting protected promotion and Cloud deployment..."
  PRIVATE_TEST_INPUT="false"
  [ "$PRIVATE_TEST_RELEASE" = "1" ] && PRIVATE_TEST_INPUT="true"
  dispatch_and_wait promote-production.yml main "$DEPLOYED_SHA" \
    -f sha="$DEPLOYED_SHA" \
    -f checklist_version="$SECURITY_CHECKLIST_VERSION" \
    -f security_review_ref="$SECURITY_REVIEW_REF" \
    -f residual_risks="$RESIDUAL_RISKS" \
    -f pentest_status="$PENTEST_STATUS" \
    -f private_test_release="$PRIVATE_TEST_INPUT"
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
    echo "Error: desktop applications need an existing public core release v$DESKTOP_VERSION."
    exit 1
  fi
  if [ "$DESKTOP_TARGET" = "windows" ]; then
    DESKTOP_WORKFLOW_REF="main"
    DESKTOP_RUN_SHA=$(git rev-parse HEAD)
    echo "→ Publishing only Microsoft Store packages for v$DESKTOP_VERSION..."
  else
    git fetch origin production
    DESKTOP_WORKFLOW_REF="production"
    DESKTOP_RUN_SHA=$(git rev-parse origin/production)
    echo "→ Publishing desktop applications for macOS, Linux, and Microsoft Store, v$DESKTOP_VERSION..."
  fi
  dispatch_and_wait desktop-release.yml "$DESKTOP_WORKFLOW_REF" "$DESKTOP_RUN_SHA" \
    -f version="$DESKTOP_VERSION" \
    -f target="$DESKTOP_TARGET"
  if [ "$DESKTOP_TARGET" = "all" ]; then
    git pull --ff-only origin main
  fi
fi

echo ""
echo "✓ Publication finished: core=$CORE · web=$WEB · desktop=$DESKTOP"
if [ -n "$DEPLOYED_SHA" ]; then
  echo "  production : $DEPLOYED_SHA"
fi
if [ -n "$TARGET_VERSION" ]; then
  echo "  tag        : v$TARGET_VERSION → $DEPLOYED_SHA"
fi
