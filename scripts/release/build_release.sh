#!/usr/bin/env bash
# =============================================================================
# TUAH RELEASE MECHANISM — build_release.sh
# -----------------------------------------------------------------------------
# NOT DEPLOYED. This script is DRY-RUN BY DEFAULT and MUST NOT be run against
# production as part of P0-7 remediation. It exists to be reviewed + approved
# by Chris/Gan before the next production deployment.
#
# Purpose: produce a DETERMINISTIC, IMMUTABLE release artifact whose identity
#          can be independently verified, answering the hard-gate question:
#          "which source commit produced this exact production build?"
#
# Scheme:
#   /home/tuah/releases/
#     <deployment_id>/           e.g. 20260922-1530-ef44a99
#       BUILD_INFO.json          commit/build_id/build_time/branch/deployment_id/...
#       artifact/                frozen .next build output (immutable dir)
#       artifact.tar.gz          frozen tarball (sha256 recorded in BUILD_INFO)
#       src-commit.txt           `git rev-parse HEAD` captured at build time
#     current -> <deployment_id> (symlink; the ONLY thing the deploy swaps)
#
# Usage:
#   ./build_release.sh                 # DRY RUN (prints every action)
#   DRY_RUN=0 ./build_release.sh       # actually build + publish a release dir
#
# Environment (all optional unless noted):
#   WORKTREE      source worktree to build from   (default: /home/tuah/releases/src/tuah2)
#   RELEASES_ROOT releases root                   (default: /home/tuah/releases)
#   BRANCH        expected branch                 (default: current branch)
#   BUILT_BY      operator label                  (default: $USER@$HOSTNAME)
#   DRY_RUN       1=dry (default) 0=real
#   PUBLISH       1=publish to RELEASES_ROOT (default 1 in real mode)
# =============================================================================
set -euo pipefail

DRY_RUN="${DRY_RUN:-1}"
WORKTREE="${WORKTREE:-/home/tuah/releases/src/tuah2}"
RELEASES_ROOT="${RELEASES_ROOT:-/home/tuah/releases}"
BUILT_BY="${BUILT_BY:-$(whoami)@$(hostname)}"

log(){ printf '%s %s\n' "[$(date '+%F %T')]" "$*"; }
run(){
  if [ "$DRY_RUN" = "1" ]; then printf 'DRY-RUN would exec: %s\n' "$*"; else log "exec: $*"; eval "$@"; fi
}

[ "$DRY_RUN" = "1" ] && log "*** DRY RUN — no files will be written, no pm2 touched ***"

# --- 0. Preconditions ---------------------------------------------------------
[ -d "$WORKTREE/.git" ] || { echo "FATAL: $WORKTREE is not a git worktree (.git missing)" >&2; exit 2; }
cd "$WORKTREE"

COMMIT="$(git rev-parse HEAD)"
SHORT="$(git rev-parse --short HEAD)"
BRANCH="$(git branch --show-current || echo detached)"
GIT_DIRTY=0
if [ -n "$(git status --porcelain)" ]; then GIT_DIRTY=1; fi

# Hard gate: refuse to build a release from a dirty tree (this is exactly the
# D7 failure mode: a fix exists in the working tree but was never committed).
if [ "$GIT_DIRTY" = "1" ] && [ "${ALLOW_DIRTY:-0}" != "1" ]; then
  echo "FATAL: working tree is dirty; commit first (or set ALLOW_DIRTY=1 to override — NOT recommended)." >&2
  git status --porcelain >&2
  exit 3
fi

DEPLOYMENT_ID="$(date -u +%Y%m%d-%H%M)-${SHORT}"
RELEASE_DIR="$RELEASES_ROOT/$DEPLOYMENT_ID"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

log "release: deployment_id=$DEPLOYMENT_ID commit=$COMMIT branch=$BRANCH dirty=$GIT_DIRTY"

# --- 1. Clean build in the pinned worktree ------------------------------------
# JWT_SECRET is required at build time by the SEC-3A1 build-time guard.
# It is sourced from the LIVE process env (same as deploy2.sh) — never committed.
if [ -z "${JWT_SECRET:-}" ]; then
  _PID="$(ps -eo pid,cmd | grep -- 'next-server' | grep -v grep | awk '{print $1}' | head -1 || true)"
  if [ -n "$_PID" ] && [ -r "/proc/$_PID/environ" ]; then
    JWT_SECRET="$(tr '\0' '\n' < "/proc/$_PID/environ" | sed -n 's/^JWT_SECRET=//p')"
  fi
fi
[ -n "${JWT_SECRET:-}" ] || log "WARN: JWT_SECRET not found; build may fail on SEC-3A1 guard"

run "rm -rf '$WORKTREE/.next'"
run "cd '$WORKTREE' && NODE_OPTIONS=--max_old_space_size=4096 npx next build > '$WORKTREE/.release_build.log' 2>&1"

BUILD_ID_FILE="$WORKTREE/.next/BUILD_ID"
if [ "$DRY_RUN" = "1" ]; then
  BUILD_ID="<dry-run-no-build>"
else
  [ -f "$BUILD_ID_FILE" ] || { echo "FATAL: build produced no .next/BUILD_ID" >&2; exit 4; }
  BUILD_ID="$(cat "$BUILD_ID_FILE")"
fi
NODE_VERSION="$(node -v 2>/dev/null || echo unknown)"
NEXT_VERSION="$(node -e "console.log(require('$WORKTREE/node_modules/next/package.json').version)" 2>/dev/null || echo unknown)"

# --- 2. Publish the immutable release dir -------------------------------------
run "mkdir -p '$RELEASE_DIR'"
run "cp -a '$WORKTREE/.next' '$RELEASE_DIR/artifact'"
run "tar -C '$RELEASE_DIR' -czf '$RELEASE_DIR/artifact.tar.gz' artifact"

# --- 3. Write BUILD_INFO.json -------------------------------------------------
if [ "$DRY_RUN" = "1" ]; then
  log "DRY-RUN would write $RELEASE_DIR/BUILD_INFO.json with:"
  cat <<JSON
{ "commit": "$COMMIT", "build_id": "$BUILD_ID", "build_time": "$BUILD_TIME",
  "branch": "$BRANCH", "deployment_id": "$DEPLOYMENT_ID",
  "node_version": "$NODE_VERSION", "next_version": "$NEXT_VERSION",
  "source_worktree": "$WORKTREE", "built_by": "$BUILT_BY", "git_dirty": $GIT_DIRTY,
  "artifact_sha256": "<sha256 of artifact.tar.gz>" }
JSON
else
  ART_SHA="$(sha256sum "$RELEASE_DIR/artifact.tar.gz" | awk '{print $1}')"
  "$(dirname "$0")/gen_build_info.sh" \
      --commit "$COMMIT" --build-id "$BUILD_ID" --build-time "$BUILD_TIME" \
      --branch "$BRANCH" --deployment-id "$DEPLOYMENT_ID" \
      --node-version "$NODE_VERSION" --next-version "$NEXT_VERSION" \
      --source-worktree "$WORKTREE" --built-by "$BUILT_BY" \
      --git-dirty "$GIT_DIRTY" --artifact-sha256 "$ART_SHA" \
      --out "$RELEASE_DIR/BUILD_INFO.json"
  printf '%s\n' "$COMMIT" > "$RELEASE_DIR/src-commit.txt"
  # Make the release dir read-only: it is an immutable audit record.
  chmod -R a-w "$RELEASE_DIR/artifact"
fi

log "release built: $RELEASE_DIR (build_id=$BUILD_ID)"
log "NEXT: activate_release.sh $DEPLOYMENT_ID   (atomic symlink swap + 1 pm2 restart)"
log "NEXT: verify_build_id.sh <https-url> $DEPLOYMENT_ID   (assert served BUILD_ID)"
