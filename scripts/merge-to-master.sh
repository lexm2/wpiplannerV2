#!/bin/bash
set -e

START_BRANCH=$(git rev-parse --abbrev-ref HEAD)
ON_MASTER=false

cleanup() {
  if [ "$ON_MASTER" = true ]; then
    echo ""
    echo "Attempting cleanup..."
    git merge --abort 2>/dev/null || true
    git checkout Development
    echo "[OK] Returned to Development branch"
  fi
}

trap cleanup EXIT

echo "=== Git Merge Script: Development → master ==="
echo ""

echo "Step 1: Pre-flight checks..."
if [ "$START_BRANCH" != "Development" ]; then
  echo "[ERROR] Must be on Development branch. Currently on: $START_BRANCH"
  exit 1
fi
echo "[OK] On Development branch"

if [ -n "$(git status --porcelain)" ]; then
  echo "[ERROR] Uncommitted changes detected. Please commit or stash your changes first."
  exit 1
fi
echo "[OK] No uncommitted changes"

echo ""
echo "Step 2: Fetching latest from remote..."
git fetch origin
echo "[OK] Fetched latest from remote"

echo ""
echo "Step 3: Running validation on Development..."
echo "Running tests..."
bun test
echo "[OK] Tests passed"

echo "Running build..."
bun run build
echo "[OK] Build succeeded"

echo ""
echo "Step 4: Switching to master..."
git checkout master
ON_MASTER=true
echo "[OK] Checked out master"

echo "Pulling latest master..."
git pull origin master
echo "[OK] Pulled latest master"

echo ""
echo "Step 5: Merging Development into master..."
if ! git merge Development --no-commit --no-ff; then
  CONFLICTS=$(git diff --name-only --diff-filter=U)

  if [ -z "$CONFLICTS" ]; then
    echo "[OK] No conflicts detected"
  else
    echo ""
    echo "Conflicts detected:"
    echo "$CONFLICTS" | sed 's/^/  - /'

    PUBLIC_CONFLICTS=$(echo "$CONFLICTS" | grep "^public/" || true)
    OTHER_CONFLICTS=$(echo "$CONFLICTS" | grep -v "^public/" || true)

    if [ -n "$OTHER_CONFLICTS" ]; then
      echo ""
      echo "[ERROR] Conflicts outside public/ directory detected:"
      echo "$OTHER_CONFLICTS" | sed 's/^/  - /'
      echo ""
      echo "These conflicts require manual resolution."
      git merge --abort
      exit 1
    fi

    if [ -n "$PUBLIC_CONFLICTS" ]; then
      echo ""
      echo "[OK] All conflicts are in public/ directory (auto-generated files)"
      echo "Resolving by accepting master's version..."
      git checkout --theirs public/
      git add public/
      echo "[OK] Conflicts resolved"
    fi
  fi
else
  echo "[OK] No conflicts detected"
fi

echo "Creating merge commit..."
git commit -m "Merge Development into master

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
echo "[OK] Merge commit created"

echo ""
echo "Step 6: Post-merge validation..."
echo "Running tests..."
bun test
echo "[OK] Tests passed"

echo "Running build..."
bun run build
echo "[OK] Build succeeded"

echo ""
echo "Step 7: Push to remote..."
echo ""
read -p "Ready to push to origin/master? Type 'yes' to continue: " -r
echo ""
if [[ $REPLY == "yes" ]]; then
  git push origin master
  echo "[OK] Pushed to origin/master"
else
  echo "[WARNING] Skipped push. Merge is committed locally on master."
  echo "  To push later: git push origin master"
fi

echo ""
echo "Step 8: Returning to Development branch..."
git checkout Development
ON_MASTER=false
echo "[OK] Returned to Development branch"

trap - EXIT

echo ""
echo "=== Merge completed successfully! ==="
echo ""
echo "Next steps:"
echo "  - Consider updating Development from master:"
echo "    git pull origin master"
