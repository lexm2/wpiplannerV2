#!/bin/bash
set -e

START_BRANCH=$(git rev-parse --abbrev-ref HEAD)
ON_MASTER=false

cleanup() {
  if [ "$ON_MASTER" = true ]; then
    git merge --abort 2>/dev/null || true
    git checkout Development
  fi
}

trap cleanup EXIT

echo "=== Merging Development → master ==="

if [ "$START_BRANCH" != "Development" ]; then
  echo "[ERROR] Must be on Development branch. Currently on: $START_BRANCH"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "[ERROR] Uncommitted changes detected. Please commit or stash your changes first."
  exit 1
fi

git fetch origin

echo ""
echo "Running validation..."
bun test
bun run build

git checkout master
ON_MASTER=true
git pull origin master

echo ""
echo "Merging..."
if ! git merge Development --no-commit --no-ff; then
  CONFLICTS=$(git diff --name-only --diff-filter=U)

  if [ -n "$CONFLICTS" ]; then
    PUBLIC_CONFLICTS=$(echo "$CONFLICTS" | grep "^public/" || true)
    OTHER_CONFLICTS=$(echo "$CONFLICTS" | grep -v "^public/" || true)

    if [ -n "$OTHER_CONFLICTS" ]; then
      echo "[ERROR] Conflicts outside public/ directory:"
      echo "$OTHER_CONFLICTS" | sed 's/^/  - /'
      echo ""
      echo "Manual resolution required."
      git merge --abort
      exit 1
    fi

    if [ -n "$PUBLIC_CONFLICTS" ]; then
      echo "Resolving auto-generated file conflicts..."
      git checkout --theirs public/
      git add public/
    fi
  fi
fi

git commit -m "Merge Development into master"

echo ""
echo "Post-merge validation..."
bun test
bun run build

echo ""
read -p "Push to origin/master? Type 'yes' to continue: " -r
echo ""
if [[ $REPLY == "yes" ]]; then
  git push origin master
else
  echo "[WARNING] Skipped push. Merge is committed locally."
  echo "  To push later: git push origin master"
fi

git checkout Development
ON_MASTER=false

trap - EXIT

echo ""
echo "=== Merge completed ==="
