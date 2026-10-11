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

echo "=== Merging Development -> master ==="

if [ "$START_BRANCH" != "Development" ]; then
  echo "[ERROR] Must be on Development branch. Currently on: $START_BRANCH"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "[ERROR] Uncommitted changes detected. Please commit or stash your changes first."
  exit 1
fi

git fetch origin

git checkout master
ON_MASTER=true
# Reset to remote master to avoid rebase conflicts from pull.rebase=true
git reset --hard origin/master

echo ""
echo "Merging..."
if ! git merge Development --no-commit --no-ff; then
  CONFLICTS=$(git diff --name-only --diff-filter=U)

  if [ -n "$CONFLICTS" ]; then
    OTHER_CONFLICTS=$(echo "$CONFLICTS" | grep -vE "^(public|data)/" || true)

    if [ -n "$OTHER_CONFLICTS" ]; then
      echo "[ERROR] Conflicts outside the public/ and data/ directories:"
      echo "$OTHER_CONFLICTS" | sed 's/^/  - /'
      echo ""
      echo "Manual resolution required."
      git merge --abort
      exit 1
    fi
  fi
fi

# Use Development's public/ directory, but keep master's copy of each data
# file Development still has, since CI keeps master's current. Only files
# Development has: one it moved or deleted must not come back. data/ is left
# as merged otherwise, so a file Development moved there keeps master's data.
git checkout MERGE_HEAD -- public/
# (ls-tree takes no globs, so the JSON is picked out with grep.)
for f in $(git ls-tree -r --name-only MERGE_HEAD -- public/ data/ | grep -E '^data/|\.json$'); do
  if git cat-file -e "HEAD:$f" 2>/dev/null; then
    git checkout HEAD -- "$f"
  fi
done
git add public/ data/

git commit -m "Merge Development into master"

git checkout Development
ON_MASTER=false
trap - EXIT

echo ""
read -p "Push to origin/master? Type 'yes' to continue: " -r || true
echo ""
if [[ $REPLY == "yes" ]]; then
  git push --no-verify origin master
else
  echo "[WARNING] Skipped push. Merge is committed locally."
  echo "  To push later: git push --no-verify origin master"
fi

echo ""
echo "=== Merge completed ==="
