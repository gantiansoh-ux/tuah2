#!/usr/bin/env bash
# =============================================================================
# TUAH RELEASE MECHANISM — gen_build_info.sh
# -----------------------------------------------------------------------------
# NOT DEPLOYED. Generates a BUILD_INFO.json for one release directory.
# Invoked by build_release.sh; also runnable standalone for tests.
# =============================================================================
set -euo pipefail

commit=""; build_id=""; build_time=""; branch=""; deployment_id=""
node_version=""; next_version=""; source_worktree=""; built_by=""
git_dirty="0"; artifact_sha256=""; out="BUILD_INFO.json"
release_notes="${RELEASE_NOTES:-}"
previous_deployment_id="${PREVIOUS_DEPLOYMENT_ID:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --commit) commit="$2"; shift 2;;
    --build-id) build_id="$2"; shift 2;;
    --build-time) build_time="$2"; shift 2;;
    --branch) branch="$2"; shift 2;;
    --deployment-id) deployment_id="$2"; shift 2;;
    --node-version) node_version="$2"; shift 2;;
    --next-version) next_version="$2"; shift 2;;
    --source-worktree) source_worktree="$2"; shift 2;;
    --built-by) built_by="$2"; shift 2;;
    --git-dirty) git_dirty="$2"; shift 2;;
    --artifact-sha256) artifact_sha256="$2"; shift 2;;
    --release-notes) release_notes="$2"; shift 2;;
    --previous-deployment-id) previous_deployment_id="$2"; shift 2;;
    --out) out="$2"; shift 2;;
    *) echo "unknown arg: $1" >&2; exit 2;;
  esac
done

for req in commit build_id build_time branch deployment_id; do
  eval "v=\$$req"
  [ -n "$v" ] || { echo "FATAL: --$req is required" >&2; exit 2; }
done

python3 - "$out" <<PYEOF
import json, sys
data = {
    "commit":                "$commit",
    "build_id":              "$build_id",
    "build_time":            "$build_time",
    "branch":                "$branch",
    "deployment_id":         "$deployment_id",
    "node_version":          "$node_version",
    "next_version":          "$next_version",
    "source_worktree":       "$source_worktree",
    "built_by":              "$built_by",
    "git_dirty":             $([ "$git_dirty" = "1" ] && echo True || echo False),
    "artifact_sha256":       "$artifact_sha256",
    "release_notes":         """$release_notes""".strip(),
    "previous_deployment_id": "$previous_deployment_id",
    "schema_version":        1,
    "generated_by":          "tuah2/scripts/release/gen_build_info.sh",
}
with open("$out", "w") as f:
    json.dump(data, f, indent=2, sort_keys=False)
    f.write("\n")
print("wrote", "$out")
PYEOF
