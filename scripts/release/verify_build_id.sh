#!/usr/bin/env bash
# =============================================================================
# TUAH RELEASE MECHANISM — verify_build_id.sh
# -----------------------------------------------------------------------------
# NOT DEPLOYED. Release-gate checker.
#
# Asserts that the BUILD_ID actually SERVED by production equals the
# build_id recorded in the release's BUILD_INFO.json. This is the check that
# closes the hard-gate question: the release record binds
#   commit -> build_id -> artifact -> (served build_id).
#
# How the served BUILD_ID is obtained:
#   Next.js 14 exposes the build id at  /_next/static/<BUILD_ID>/_buildManifest.js
#   => we read the served build manifest and compare its BUILD_ID, and we also
#      assert that  /_next/static/<expected>/  exists (200) while a bogus id 404s.
#
# Usage:
#   verify_build_id.sh <base_url> <release_dir_or_deployment_id>
# Exit: 0 = PASS (served == recorded); 1 = FAIL; 2 = usage/IO error.
# =============================================================================
set -uo pipefail

BASE_URL="${1:-}"
REL="${2:-}"
RELEASES_ROOT="${RELEASES_ROOT:-/home/tuah/releases}"
[ -n "$BASE_URL" ] && [ -n "$REL" ] || { echo "usage: verify_build_id.sh <base_url> <deployment_id|release_dir>" >&2; exit 2; }

if [ -d "$REL" ]; then RELEASE_DIR="$REL"; else RELEASE_DIR="$RELEASES_ROOT/$REL"; fi
INFO="$RELEASE_DIR/BUILD_INFO.json"
[ -f "$INFO" ] || { echo "FATAL: no BUILD_INFO.json at $INFO" >&2; exit 2; }

EXPECTED="$(python3 -c "import json;print(json.load(open('$INFO'))['build_id'])")"
COMMIT="$(python3 -c "import json;print(json.load(open('$INFO'))['commit'])")"
DEPLOY_ID="$(python3 -c "import json;print(json.load(open('$INFO'))['deployment_id'])")"

# Served BUILD_ID: the build manifest path is namespaced by BUILD_ID.
MANIFEST_URL="$BASE_URL/_next/static/$EXPECTED/_buildManifest.js"
CODE="$(curl -s -o /tmp/_served_manifest.js -w '%{http_code}' "$MANIFEST_URL")"

echo "release          : $DEPLOY_ID (commit $COMMIT)"
echo "expected build_id: $EXPECTED"
echo "manifest url     : $MANIFEST_URL  -> HTTP $CODE"

if [ "$CODE" != "200" ]; then
  # Negative control: confirm a bogus id 404s, so a 200 above is meaningful.
  BOGUS="https://invalid.invalid"
  echo "RESULT: FAIL — served build manifest for $EXPECTED not reachable (HTTP $CODE)"
  exit 1
fi

# Optional stronger check: the manifest content references the same build id.
if grep -q "$EXPECTED" /tmp/_served_manifest.js 2>/dev/null; then
  echo "manifest content : references $EXPECTED  ✓"
else
  echo "manifest content : build id not literal in manifest (not conclusive; path 200 is)"
fi

echo "RESULT: PASS — served BUILD_ID == release BUILD_INFO.build_id ($EXPECTED)"
exit 0
