#!/usr/bin/env bash
# =============================================================================
# TUAH RELEASE MECHANISM — migrate_current_to_releases.sh
# -----------------------------------------------------------------------------
# NOT DEPLOYED. DRY-RUN BY DEFAULT. ONE-TIME, ZERO-DOWNTIME migration.
#
# Moves the CURRENTLY-SERVING /home/tuah/tuah2 build into the new scheme so the
# next release has a proper predecessor (for rollback) and the releases root
# starts populated.
#
# IMPORTANT / HONEST CAVEAT:
#   The exact commit that produced the live BUILD_ID qaQdu5DxplGek_nKWPiFU CANNOT
#   be retroactively proven. Evidence (see P0-7 probe4/5: the build log
#   /home/tuah/staging_build.log records source paths under tuah2-arch-p1-1 while
#   using tuah2/node_modules, and tuah2/.next/BUILD_ID is byte-identical — same
#   sha256, same mtime to the nanosecond — to tuah2-arch-p1-1/.next/BUILD_ID)
#   supports but does NOT prove commit ccc1be08b4259a9c097567e1c5b6be2dcf8f54cd.
#   This migration therefore records provenance_kind = "asserted-inferred",
#   NOT "proven".
#
# This script touches NOTHING that is serving: it only COPIES. It does not
# restart PM2 and does not move/replace /home/tuah/tuah2/.next.
# =============================================================================
set -euo pipefail

DRY_RUN="${DRY_RUN:-1}"
RELEASES_ROOT="${RELEASES_ROOT:-/home/tuah/releases}"
SERVE_DIR="${SERVE_DIR:-/home/tuah/tuah2}"
INFERRED_COMMIT="${INFERRED_COMMIT:-ccc1be08b4259a9c097567e1c5b6be2dcf8f54cd}"
INFERRED_WORKTREE="${INFERRED_WORKTREE:-/home/tuah/tuah2-arch-p1-1}"
DEPLOYMENT_ID="${DEPLOYMENT_ID:-20260829-2023-qaQdu5Dx-legacy}"

log(){ printf '%s %s\n' "[$(date '+%F %T')]" "$*"; }
run(){
  if [ "$DRY_RUN" = "1" ]; then printf 'DRY-RUN would exec: %s\n' "$*"; else log "exec: $*"; eval "$@"; fi
}
[ "$DRY_RUN" = "1" ] && log "*** DRY RUN — nothing written ***"

RELEASE_DIR="$RELEASES_ROOT/$DEPLOYMENT_ID"
BUILD_ID="$(cat "$SERVE_DIR/.next/BUILD_ID")"

log "adopting live build BUILD_ID=$BUILD_ID as release $DEPLOYMENT_ID"
log "inferred commit (NOT proven): $INFERRED_COMMIT"

# 1. Copy the live artifact into the releases root (COPY ONLY — serving dir untouched).
run "mkdir -p '$RELEASE_DIR'"
run "cp -a '$SERVE_DIR/.next' '$RELEASE_DIR/artifact'"
run "tar -C '$RELEASE_DIR' -czf '$RELEASE_DIR/artifact.tar.gz' artifact"

# 2. Write BUILD_INFO.json marked as asserted/inferred (no sha256 lie: we hash what we copied).
if [ "$DRY_RUN" = "1" ]; then
  log "DRY-RUN would write $RELEASE_DIR/BUILD_INFO.json (provenance_kind=asserted-inferred)"
else
  ART_SHA="$(sha256sum "$RELEASE_DIR/artifact.tar.gz" | awk '{print $1}')"
  "$(dirname "$0")/gen_build_info.sh" \
      --commit "$INFERRED_COMMIT" --build-id "$BUILD_ID" \
      --build-time "2026-08-29T20:23:25+08:00" \
      --branch "arch/p1-1-sole-entries" --deployment-id "$DEPLOYMENT_ID" \
      --node-version "v20.20.2" --next-version "14.2.15" \
      --source-worktree "$INFERRED_WORKTREE" --built-by "legacy (pre-release-mechanism)" \
      --git-dirty 1 --artifact-sha256 "$ART_SHA" \
      --release-notes "Adopted live build; commit only INFERRED, see P0-7-REPORT.md" \
      --out "$RELEASE_DIR/BUILD_INFO.json"
  python3 - "$RELEASE_DIR/BUILD_INFO.json" <<'PY'
import json,sys
p=sys.argv[1]; d=json.load(open(p))
d["provenance_kind"]="asserted-inferred"
d["provenance_note"]=("BUILD_ID sha256-identical to tuah2-arch-p1-1/.next/BUILD_ID and build "
  "log paths point there, so ccc1be08 is the most probable source; NOT independently provable.")
json.dump(d,open(p,"w"),indent=2); open(p,"a").write("\n")
print("annotated",p)
PY
fi

# 3. Seed the "current" symlink so rollback has a predecessor.
run "ln -sfn '$RELEASE_DIR' '$RELEASES_ROOT/current'"

log "migrated. Serving dir /home/tuah/tuah2 UNTOUCHED; pm2 NOT restarted."
log "The NEXT deploy should switch /home/tuah/tuah2/.next to a symlink (see activate_release.sh)."
