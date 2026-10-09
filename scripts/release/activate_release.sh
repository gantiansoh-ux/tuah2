#!/usr/bin/env bash
# =============================================================================
# TUAH RELEASE MECHANISM — activate_release.sh
# -----------------------------------------------------------------------------
# NOT DEPLOYED. DRY-RUN BY DEFAULT.
#
# Deterministic, near-atomic deploy:
#   1. Look up release dir /home/tuah/releases/<deployment_id>; verify integrity
#      (artifact sha256 matches BUILD_INFO.json, BUILD_ID present).
#   2. Atomically swap the symlink /home/tuah/tuah2-release -> release dir
#      (ln -sfn + mv -T gives an atomic rename on the same filesystem).
#   3. Symlink the PM2-served artifact into place: the serving dir's `.next`
#      becomes a symlink to <release>/artifact (immutable, fingerprinted).
#   4. ONE controlled `pm2 restart tuah`.
#   5. Verify served BUILD_ID == BUILD_INFO.json:build_id (calls verify_build_id.sh).
#      On mismatch -> roll back the symlink to the previous release and restart.
#
# Rollback:  ./activate_release.sh <previous_deployment_id>
# =============================================================================
set -euo pipefail

DRY_RUN="${DRY_RUN:-1}"
RELEASES_ROOT="${RELEASES_ROOT:-/home/tuah/releases}"
SERVE_DIR="${SERVE_DIR:-/home/tuah/tuah2}"          # PM2 exec cwd (serving dir)
LIVE_LINK="${LIVE_LINK:-$RELEASES_ROOT/current}"    # stable "currently serving" link
PM2_NAME="${PM2_NAME:-tuah}"
VERIFY_URL="${VERIFY_URL:-https://tuah.com}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

log(){ printf '%s %s\n' "[$(date '+%F %T')]" "$*"; }
run(){
  if [ "$DRY_RUN" = "1" ]; then printf 'DRY-RUN would exec: %s\n' "$*"; else log "exec: $*"; eval "$@"; fi
}

DEPLOYMENT_ID="${1:-}"
[ -n "$DEPLOYMENT_ID" ] || { echo "usage: activate_release.sh <deployment_id> [--previous <id>]" >&2; exit 2; }
RELEASE_DIR="$RELEASES_ROOT/$DEPLOYMENT_ID"
[ -d "$RELEASE_DIR" ] || { echo "FATAL: no such release: $RELEASE_DIR" >&2; exit 2; }

[ "$DRY_RUN" = "1" ] && log "*** DRY RUN — symlink swaps and pm2 restart are NOT executed ***"

# --- 1. Verify the release artifact integrity ---------------------------------
log "verifying release $DEPLOYMENT_ID"
run "test -f '$RELEASE_DIR/BUILD_INFO.json'"
run "test -d '$RELEASE_DIR/artifact'"
if [ "$DRY_RUN" != "1" ]; then
  WANT_SHA="$(python3 -c "import json;print(json.load(open('$RELEASE_DIR/BUILD_INFO.json'))['artifact_sha256'])")"
  GOT_SHA="$(sha256sum "$RELEASE_DIR/artifact.tar.gz" | awk '{print $1}')"
  [ "$WANT_SHA" = "$GOT_SHA" ] || { echo "FATAL: artifact sha256 mismatch ($WANT_SHA != $GOT_SHA)" >&2; exit 3; }
  RELEASE_BUILD_ID="$(python3 -c "import json;print(json.load(open('$RELEASE_DIR/BUILD_INFO.json'))['build_id'])")"
  [ "$(cat "$RELEASE_DIR/artifact/BUILD_ID")" = "$RELEASE_BUILD_ID" ] \
      || { echo "FATAL: artifact BUILD_ID != BUILD_INFO.build_id" >&2; exit 3; }
fi

# --- 2. Record rollback target ------------------------------------------------
PREV="$(readlink -f "$LIVE_LINK" 2>/dev/null || true)"
log "rollback target (previous release): ${PREV:-<none>}"

# --- 3. Atomic symlink swap ---------------------------------------------------
# ln -sfn to a temp name then mv -T = atomic replace (same fs). No downtime because
# the running node process keeps its already-open inodes until step 4's restart.
run "ln -sfn '$RELEASE_DIR' '$LIVE_LINK.tmp'"
run "mv -Tf '$LIVE_LINK.tmp' '$LIVE_LINK'"
log "live symlink -> $LIVE_LINK = $DEPLOYMENT_ID"

# --- 4. Point the serving dir's .next at the immutable artifact --------------
# The serving dir keeps node_modules/ecosystem/package.json; only .next is swapped.
run "if [ -e '$SERVE_DIR/.next' ] && [ ! -L '$SERVE_DIR/.next' ]; then mv '$SERVE_DIR/.next' '$SERVE_DIR/.next.retired-\$(date +%Y%m%d%H%M%S)'; fi"
run "ln -sfn '$RELEASE_DIR/artifact' '$SERVE_DIR/.next'"

# --- 5. Single controlled restart + verify ------------------------------------
run "pm2 restart '$PM2_NAME'"
run "sleep 5"
if [ "$DRY_RUN" = "1" ]; then
  log "DRY-RUN would run: verify_build_id.sh $VERIFY_URL $DEPLOYMENT_ID"
else
  if ! "$SCRIPT_DIR/verify_build_id.sh" "$VERIFY_URL" "$DEPLOYMENT_ID"; then
    log "VERIFY FAILED — rolling back"
    if [ -n "$PREV" ]; then
      run "ln -sfn '$PREV' '$LIVE_LINK.tmp' && mv -Tf '$LIVE_LINK.tmp' '$LIVE_LINK'"
      run "ln -sfn '$PREV/artifact' '$SERVE_DIR/.next'"
      run "pm2 restart '$PM2_NAME'"
      log "rolled back to $(basename "$PREV")"
    fi
    exit 4
  fi
fi

log "release $DEPLOYMENT_ID activated. Rollback: activate_release.sh $(basename "${PREV:-<prev>}")"
