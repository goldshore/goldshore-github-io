#!/usr/bin/env bash
set -euo pipefail

REMOTE="origin"
BRANCH="main"
PUSH="false"

usage() {
  cat <<USAGE
Usage: scripts/sync-main.sh [options]

Options:
  --remote <name>   Remote to sync with (default: origin)
  --branch <name>   Branch to sync (default: main)
  --push            Push the branch after fast-forwarding
  -h, --help        Show this help message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      REMOTE="${2:-}"
      shift 2
      ;;
    --branch)
      BRANCH="${2:-}"
      shift 2
      ;;
    --push)
      PUSH="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "Error: scripts/sync-main.sh must be run inside a git repository" >&2
  exit 1
fi

if ! git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Creating local $BRANCH branch from $REMOTE/$BRANCH" >&2
  git fetch "$REMOTE" "$BRANCH"
  git checkout -b "$BRANCH" "$REMOTE/$BRANCH"
fi

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$CURRENT_BRANCH" != "$BRANCH" ]]; then
  echo "Checking out $BRANCH" >&2
  git checkout "$BRANCH"
fi

UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true)
EXPECTED_UPSTREAM="$REMOTE/$BRANCH"
if [[ "$UPSTREAM" != "$EXPECTED_UPSTREAM" ]]; then
  echo "Setting upstream of $BRANCH to $EXPECTED_UPSTREAM" >&2
  git branch --set-upstream-to="$EXPECTED_UPSTREAM" "$BRANCH"
fi

echo "Fetching $REMOTE/$BRANCH" >&2
git fetch "$REMOTE" "$BRANCH"

read -r REMOTE_AHEAD LOCAL_AHEAD < <(git rev-list --left-right --count "$REMOTE/$BRANCH"...HEAD)

if (( REMOTE_AHEAD > 0 && LOCAL_AHEAD > 0 )); then
  echo "Error: $BRANCH has diverged from $REMOTE/$BRANCH. Please resolve manually." >&2
  exit 1
fi

if (( LOCAL_AHEAD > 0 )); then
  echo "$BRANCH is ahead of $REMOTE/$BRANCH by $LOCAL_AHEAD commit(s); skipping fast-forward" >&2
elif (( REMOTE_AHEAD > 0 )); then
  echo "Fast-forwarding $BRANCH" >&2
  git merge --ff-only "$REMOTE/$BRANCH"
else
  echo "$BRANCH is already up to date with $REMOTE/$BRANCH" >&2
fi

if [[ "$PUSH" == "true" ]]; then
  echo "Pushing $BRANCH to $REMOTE" >&2
  git push "$REMOTE" "$BRANCH"
fi
