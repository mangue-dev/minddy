#!/bin/bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  cat <<'EOF'
Usage: npm run deploy [patch|minor|major|none]

Deploys minddy to production by merging the current branch into `production`
and pushing it. Vercel watches the `production` branch, so pushing production
IS the deploy trigger — there is no explicit `vercel deploy` step.

Pipeline:
  1. Verify the working tree is clean.
  2. Run `npm run typecheck` (aborts on failure).
  3. Bump the version (patch/minor/major) or skip — commit + tag the bump.
  4. Push the current branch (usually `main`) → Vercel preview deploy.
  5. Merge the current branch into `production` + push → Vercel production deploy.

Branch model:
  main        → preview deploys (every push)
  production  → production deploy (only via `npm run deploy`)

Pass the bump type as an argument for a non-interactive run
(e.g. `npm run deploy -- patch`); omit it to get the interactive menu.
The `v<version>` tag is for release tracking only — minddy is private, so
nothing is published to npm.
EOF
  exit 0
fi

CURRENT=$(git branch --show-current)

if [ -z "$CURRENT" ]; then
  echo "Error: detached HEAD. Checkout a branch (e.g. main) first."
  exit 1
fi

if [ "$CURRENT" = "production" ]; then
  echo "Error: run deploy from your working branch (e.g. main), not production."
  exit 1
fi

# 1. Working tree must be clean.
if ! git diff-index --quiet HEAD --; then
  echo "Error: you have uncommitted changes. Commit or stash them first."
  git status --short
  exit 1
fi

# The production branch must already exist on origin. Checked before anything is
# mutated (version bump / push) so a missing branch can't leave a half deploy.
if ! git ls-remote --exit-code --heads origin production >/dev/null 2>&1; then
  echo "Error: origin has no 'production' branch yet (one-time setup, see README)."
  echo "  git checkout -b production && git push -u origin production && git checkout $CURRENT"
  exit 1
fi

# 2. Typecheck gate — set -e aborts the deploy if this fails.
echo "→ Running typecheck..."
npm run typecheck

# 3. Version bump (patch/minor/major or none).
CURRENT_VERSION=$(node -p "require('./package.json').version")
IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "$CURRENT_VERSION"
NEXT_PATCH="$V_MAJOR.$V_MINOR.$((V_PATCH + 1))"
NEXT_MINOR="$V_MAJOR.$((V_MINOR + 1)).0"
NEXT_MAJOR="$((V_MAJOR + 1)).0.0"

BUMP_TYPE="${1:-}"
if [ -z "$BUMP_TYPE" ]; then
  echo ""
  echo "Current version: $CURRENT_VERSION"
  echo "Select version bump:"
  echo "  1) patch → $NEXT_PATCH"
  echo "  2) minor → $NEXT_MINOR"
  echo "  3) major → $NEXT_MAJOR"
  echo "  4) no version bump"
  read -p "Choice [1-4]: " BUMP_CHOICE
  case "$BUMP_CHOICE" in
    1) BUMP_TYPE="patch" ;;
    2) BUMP_TYPE="minor" ;;
    3) BUMP_TYPE="major" ;;
    4) BUMP_TYPE="none" ;;
    *) echo "Invalid choice, aborting."; exit 1 ;;
  esac
fi

NEW_VERSION=""
case "$BUMP_TYPE" in
  patch|minor|major)
    echo "→ Bumping $BUMP_TYPE version..."
    npm version "$BUMP_TYPE" --no-git-tag-version
    NEW_VERSION=$(node -p "require('./package.json').version")
    git add package.json package-lock.json
    git commit -m "chore: bump version to $NEW_VERSION"
    git tag "v$NEW_VERSION"
    echo "→ Bumped and tagged v$NEW_VERSION"
    ;;
  none)
    echo "→ No version bump"
    ;;
  *)
    echo "Error: invalid bump type '$BUMP_TYPE' (use patch|minor|major|none)."
    exit 1
    ;;
esac

# 4. Push the current branch → triggers a Vercel preview deploy.
echo "→ Pushing $CURRENT to origin..."
git push origin "$CURRENT"
if [ -n "$NEW_VERSION" ]; then
  git push origin "v$NEW_VERSION"
fi

# 5. Merge the current branch into production and push → the production deploy.
echo ""
echo "→ Merging $CURRENT into production (this push triggers the Vercel production deploy)..."

git fetch origin production

if ! git checkout production; then
  echo "Error: failed to checkout production branch."
  echo "Note: production was NOT redeployed."
  git checkout "$CURRENT" 2>/dev/null || true
  exit 1
fi

if ! git pull --ff-only origin production; then
  echo "Error: local production diverges from origin/production. Resolve manually before re-running deploy."
  echo "Note: production was NOT redeployed."
  git checkout "$CURRENT" 2>/dev/null || true
  exit 1
fi

if ! git merge "$CURRENT" --no-edit; then
  echo "Error: merge conflict between $CURRENT and production."
  echo "Resolve on the production branch manually, then re-run deploy."
  echo "Note: production was NOT redeployed."
  git merge --abort
  git checkout "$CURRENT" 2>/dev/null || true
  exit 1
fi

if ! git push origin production; then
  echo "Error: failed to push production to origin."
  echo "Note: production was NOT redeployed."
  git checkout "$CURRENT" 2>/dev/null || true
  exit 1
fi

git checkout "$CURRENT"

# 6. IndexNow : prévenir Bing (et donc ChatGPT Search, qui lit son index) que
# les pages publiques ont changé. Best-effort — le script n'échoue jamais, et
# `|| true` couvre même le cas où node planterait : un recrawl différé ne
# justifie pas de faire échouer un déploiement déjà poussé.
echo ""
echo "→ Pinging IndexNow..."
node scripts/indexnow.mjs || true

echo ""
echo "✓ production updated with $CURRENT (now at $(git rev-parse --short production))"
echo "  → Vercel is deploying production from the production branch."
