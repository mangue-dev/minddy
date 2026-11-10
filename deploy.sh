#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

usage() {
  cat <<'EOF'
Usage: npm run deploy [-- auto|all|custom|windows]

Minddy's single publishing assistant.

  auto    recommend scopes based on modified files
  all     publish the core, deploy the web app, and publish the Linux and Windows desktop applications
  custom  ask a question for each scope
  windows publish only the existing version's Microsoft Store packages

With no argument, an interactive menu offers the automatic, all, and custom modes.

Scopes:
  public core  SemVer version + tag + GitHub Release + artifacts
  Cloud web    www.minddy.app instance deployed from `production`
  desktop      Linux and Microsoft Store Windows packages attached to the core release;
               macOS is signed and published from the maintainer's Mac
  windows      x64 and ARM64 Store MSIX packages, without the Linux job

Marketing is part of the web build: a marketing-only change suggests
a Cloud deployment without artificially creating a core version.

A core release publishes the version already prepared on main: prepare it in
a pull request with `npm run release:prepare -- X.Y.Z`. This assistant never
pushes to main.

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
git merge --ff-only origin/main
# `main` only accepts squash-merged pull requests, so this assistant never
# pushes to it: the candidate is the commit the remote already has.
if [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ]; then
  echo "Error: local main has commits that origin/main lacks. Publish them through a pull request first."
  exit 1
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
    if yes_no "Build and publish the Linux and Windows desktop applications?" "$([ "$AUTO_DESKTOP" = "true" ] && echo yes || echo no)"; then DESKTOP=1; fi
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

SECURITY_CHECKLIST_VERSION="2.0"
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
if [ "$CORE" -eq 1 ]; then
  require_gh
  if [ "$CURRENT" != "main" ]; then
    echo "Error: a public core release must be prepared from main (current: $CURRENT)."
    exit 1
  fi
  CURRENT_VERSION=$(node -p "require('./package.json').version")
  if [ -n "$(git tag --list "v$CURRENT_VERSION")" ]; then
    echo ""
    echo "Version $CURRENT_VERSION is already published, and main only accepts pull requests."
    if [ "$MODE" = "auto" ]; then
      # Product files change with most deployments; a Cloud deployment must
      # not wait for a version nobody has prepared.
      echo "No new version is prepared on main: deploying the Cloud web without a core release."
      CORE=0
      # Selecting the core had implied the web promotion its tag needs.
      [ "$AUTO_WEB" = "true" ] || WEB=0
      if [ "$WEB" -eq 0 ] && [ "$DESKTOP" -eq 0 ]; then
        echo "Nothing to publish: production already serves main."
        exit 0
      fi
    else
      echo "Prepare the next version on a work branch, then run this command again once it is merged:"
      echo "  npm run work:start -- \"release X.Y.Z\""
      echo "  npm run release:prepare -- X.Y.Z"
      echo "  add the X.Y.Z row to deploy/self-hosted/compatibility.json and bump deploy/self-hosted/.env.example"
      echo "  git commit -s -am \"chore: prepare release X.Y.Z\""
      echo "  npm run work:pr -- \"chore: prepare release X.Y.Z\" -m \"...\""
      echo "The pull request runs the Release preflight workflow on the candidate."
      exit 1
    fi
  fi
fi
if [ "$CORE" -eq 1 ]; then
  TARGET_VERSION="$CURRENT_VERSION"
  echo "→ Public core v$TARGET_VERSION is prepared on main and not published yet."
  node -e 'import("./scripts/release-lib.mjs").then(({assertVersion}) => assertVersion(process.argv[1]))' "$TARGET_VERSION"
fi

if [ "$DESKTOP" -eq 1 ]; then
  require_gh
fi

# Quick check of the local mechanism that prepares the request. The gates of
# trust runs in CI on the pushed SHA; this post is not the source.
echo "→ Checking release tooling..."
npm run test:release

# Settings and release data that a workflow would otherwise find missing after
# the protected approval: the Actions allowlist, the environments' secrets and
# variables, and the prepared version's compatibility data.
echo "→ Checking repository settings for the selected workflows..."
PREFLIGHT_ARGS=()
if [ "$CORE" -eq 1 ] || [ "$WEB" -eq 1 ]; then PREFLIGHT_ARGS+=(--workflow promote-production.yml); fi
if [ "$CORE" -eq 1 ]; then PREFLIGHT_ARGS+=(--workflow release.yml --version "$TARGET_VERSION"); fi
if [ "$DESKTOP" -eq 1 ]; then PREFLIGHT_ARGS+=(--workflow desktop-release.yml); fi
node scripts/release-preflight.mjs "${PREFLIGHT_ARGS[@]}"

# The report must name the exact SHA that will be promoted, so the review is
# requested once the candidate is known and before any workflow starts.
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
      echo "1) not required after the recorded risk-based review"
      echo "2) required, completed and blocking findings retested"
      echo "3) required but not completed (promotion will be refused)"
      read -r -p "Choice [1-3]: " PENTEST_CHOICE
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
  # The public-release environment accepts only `production` and release tags,
  # whichever platforms are published.
  git fetch origin production
  DESKTOP_WORKFLOW_REF="production"
  DESKTOP_RUN_SHA=$(git rev-parse origin/production)
  if [ "$DESKTOP_TARGET" = "windows" ]; then
    echo "→ Publishing only Microsoft Store packages for v$DESKTOP_VERSION..."
  else
    echo "→ Publishing Linux and Microsoft Store desktop applications, v$DESKTOP_VERSION..."
  fi
  dispatch_and_wait desktop-release.yml "$DESKTOP_WORKFLOW_REF" "$DESKTOP_RUN_SHA" \
    -f version="$DESKTOP_VERSION" \
    -f target="$DESKTOP_TARGET"
  if [ "$DESKTOP_TARGET" = "all" ]; then
    echo "→ macOS is next, from this Mac: build, notarize and publish it, then record"
    echo "  desktop/released.json in a pull request (docs/desktop-release.md)."
    echo "  The record changes no deployed file and needs no promotion of its own."
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
