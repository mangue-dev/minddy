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
  2. Last-net gates (abort on failure): tests, dependency audit (3 lockfiles),
     typecheck, and the CI verdict for HEAD if `gh` is available. The gates of
     record live in .github/workflows/ci.yml — this script only repeats them.
  3. Bump the version (patch/minor/major) or skip — commit + tag the bump.
  3b. Desktop app: republish ONLY if the macOS shell actually changed.
  4. Push the current branch (usually `main`) → Vercel preview deploy.
  5. Merge the current branch into `production` + push → Vercel production deploy.

Desktop app (macOS):
  The app is a window onto www.minddy.app, so deploying the site is enough for
  almost everything. Step 3b compares a fingerprint of what really goes into the
  binary against the last published one (desktop/released.json) and offers to
  rebuild only when they differ — a version bump alone never triggers it.
  Set MINDDY_SKIP_DESKTOP=1 to skip the check. See docs/desktop-release.md.

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

# 2. Gates de qualité — set -e aborte le deploy si l'une échoue.
#
# Depuis MIN-335, la VÉRITÉ vient de la CI GitHub ([.github/workflows/ci.yml]) :
# elle joue les mêmes gates dans un runner jetable, sur chaque PR et chaque push.
# Ce script n'est plus le pipeline, il en est le DERNIER FILET — celui qui couvre
# le commit local pas encore poussé, et celui qui refuse de mettre en production
# un commit dont la CI est rouge.
#
# La distinction compte pour une raison de sécurité, pas de confort : tout ce qui
# suit s'exécute ICI, sur une machine dont le `.env` porte la clé `service_role`
# de production. Ne JAMAIS faire de ce script le lieu où l'on vérifie du code
# qu'on n'a pas écrit (une PR d'un contributeur) — c'est le rôle de la CI, et
# c'est dit dans [CONTRIBUTING.md].

# 2a. Suite de tests vitest.
echo "→ Running tests..."
npm run test

# 2b. Audit des dépendances : toute vuln high/critical bloque le deploy.
# Les trois lockfiles du dépôt, arbre entier — le pourquoi est dans le script.
echo "→ Running dependency audit (3 lockfiles, high+)..."
node scripts/audit.mjs

# 2c. Typecheck.
echo "→ Running typecheck..."
npm run typecheck

# 2d. La CI du commit qu'on s'apprête à mettre en production. Best-effort :
# `gh` n'est pas une dépendance du dépôt, et une CI en cours ne doit pas bloquer
# un déploiement décidé en connaissance de cause. Une CI ROUGE, si.
if command -v gh >/dev/null 2>&1; then
  CI_STATE=$(gh run list --commit "$(git rev-parse HEAD)" --workflow CI \
    --limit 1 --json conclusion --jq '.[0].conclusion' 2>/dev/null || echo "")
  case "$CI_STATE" in
    failure|cancelled|timed_out)
      echo "Error: la CI est $CI_STATE sur $(git rev-parse --short HEAD)."
      echo "  → gh run list --commit $(git rev-parse HEAD)"
      exit 1
      ;;
    success)
      echo "→ CI: green on $(git rev-parse --short HEAD)"
      ;;
    *)
      echo "→ CI: pas de verdict pour $(git rev-parse --short HEAD) (jamais poussé, ou en cours) — on continue."
      ;;
  esac
else
  echo "→ CI: gh absent, verdict non consulté — on continue."
fi

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

# 3b. L'app de bureau macOS (MIN-292) — republier SEULEMENT si elle a changé.
#
# L'app est une fenêtre sur www.minddy.app : le déploiement ci-dessous suffit à
# changer ce qu'elle affiche, et la plupart des déploiements ne la concernent
# pas. Republier un binaire coûte une dizaine de minutes de machine ÉVEILLÉE
# (mesuré : signature, notarisation, agrafage, puis 485 Mo d'envoi) et 120 Mo que
# chaque utilisateur téléchargera — on ne le fait donc que sur un vrai
# changement de la COQUILLE, pas sur un bump de version.
#
# `desktop-fingerprint.mjs` tranche : il demande à esbuild quels fichiers entrent
# réellement dans le bundle (la liste déborde de `desktop/` — `lib/public-routes.ts`
# en fait partie) et ignore ce qui bouge sans rien changer au comportement. Voir
# docs/desktop-release.md.
#
# Ici, et pas plus tôt : la version vient d'être posée, et l'app doit porter
# celle du site dont elle est tirée.
DESKTOP_SKIP="${MINDDY_SKIP_DESKTOP:-}"
if [ "$DESKTOP_SKIP" = "1" ]; then
  echo "→ Desktop app: skipped (MINDDY_SKIP_DESKTOP=1)"
elif [ ! -f desktop/released.json ]; then
  echo "⚠ Desktop app: never published (desktop/released.json missing)."
  echo "  See docs/desktop-release.md — deploy continues, the app is untouched."
elif [ "$(node scripts/desktop-fingerprint.mjs)" = "$(node -p "require('./desktop/released.json').fingerprint")" ]; then
  echo "→ Desktop app: unchanged since $(node -p "require('./desktop/released.json').version") — nothing to republish."
else
  echo ""
  echo "→ Desktop app: the shell CHANGED since it was last published."
  node scripts/desktop-fingerprint.mjs --explain | sed 's/^/    /'
  echo ""
  echo "  Rebuilding signs + notarizes and pushes ~485 MB to the feed — ~10 min, measured."
  echo "  It runs LOCALLY and waits on Apple: keep the Mac awake (caffeinate is applied)."
  echo "  Installed apps pick it up within 6 h and install it on their next quit."

  DESKTOP_ANSWER=""
  if [ -t 0 ]; then
    read -p "  Rebuild and publish the desktop app now? [Y/n]: " DESKTOP_ANSWER
  else
    # Non interactif (CI, script) : on ne lance pas dix minutes de build et
    # d'envoi tout seul, et surtout on ne le TAIT pas.
    echo "  Non-interactive run: skipping. Run \`npm run desktop:release\` when ready."
    DESKTOP_ANSWER="n"
  fi

  case "$DESKTOP_ANSWER" in
    n|N|no|NO)
      echo "  → Skipped. The site deploys; installed apps keep the previous shell."
      ;;
    *)
      # Les identifiants vivent dans `.env` (flux de mise à jour, jeton du blob,
      # profil trousseau de notarisation). `set -a` les exporte pour les deux
      # scripts appelés ci-dessous.
      if [ -f .env ]; then set -a; . ./.env; set +a; fi
      : "${APPLE_KEYCHAIN_PROFILE:?manque — voir docs/desktop-signing.md §3}"
      : "${MINDDY_DESKTOP_FEED_URL:?manque — voir docs/desktop-release.md}"

      # `caffeinate -i` empêche la veille PENDANT ces deux commandes, et rend la
      # main juste après. Ce n'est pas du confort : la notarisation est une
      # ATTENTE d'un verdict distant, et le ticket doit ensuite être agrafé dans
      # le bundle ICI. Un Mac qui s'endort au milieu suspend le processus et
      # casse l'attente — après quoi il faut tout recommencer, Apple compris.
      # Le couvercle rabattu, lui, endort la machine quoi qu'il arrive : ce
      # garde-fou couvre la veille d'inactivité, pas celle-là.
      echo "→ Building, signing and notarizing the desktop app (~10 min, keep the lid open)..."
      caffeinate -i npm --prefix desktop run dist

      echo "→ Publishing the update feed (~485 MB)..."
      caffeinate -i node scripts/publish-desktop.mjs

      git add desktop/package.json desktop/package-lock.json desktop/released.json
      git commit -m "chore(desktop): publish $(node -p "require('./desktop/package.json').version")"
      echo "→ Desktop app published and recorded."
      ;;
  esac
fi

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
