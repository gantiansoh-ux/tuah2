# TUAH RELEASE MECHANISM — OPERATOR RUNBOOK
**Status: NOT DEPLOYED.** Dry-run only. Requires Chris/Gan approval before any real run.

## Why this exists (hard-gate question)
> "Which source commit produced the exact production build currently served?"

Today (2026-09-22) this **cannot be answered provably**: `/home/tuah/tuah2` has no `.git`
and no deploy manifest; `BUILD_ID=qaQdu5DxplGek_nKWPiFU` alone proves nothing. This
mechanism makes every future build **identifiable** by construction.

## Layout produced
```
/home/tuah/releases/
  current -> 20260922-1530-ef44a99          (symlink; the only thing swapped)
  20260829-2023-qaQdu5Dx-legacy/            (adopted live build; provenance ASSERTED)
    BUILD_INFO.json
    artifact/                               (immutable .next; chmod a-w)
    artifact.tar.gz
    src-commit.txt
  20260922-1530-ef44a99/
    BUILD_INFO.json
    artifact/  artifact.tar.gz  src-commit.txt
```

## Golden path (each release)
```
# 0. Build from a CLEAN worktree pinned to a commit (dirty tree is refused):
DRY_RUN=1 ./build_release.sh                       # preview
DRY_RUN=0 WORKTREE=/home/tuah/releases/src/tuah2 ./build_release.sh

# 1. Activate (atomic symlink swap + ONE pm2 restart + self-verify):
DRY_RUN=1 ./activate_release.sh 20260922-1530-ef44a99    # preview
DRY_RUN=0 VERIFY_URL=https://tuah.com ./activate_release.sh 20260922-1530-ef44a99

# 2. Verify (also runnable standalone by the release gate):
./verify_build_id.sh https://tuah.com 20260922-1530-ef44a99
```

## Rollback
```
DRY_RUN=0 ./activate_release.sh 20260829-2023-qaQdu5Dx-legacy
# previous release dir is immutable & intact; swap the symlink back + one restart.
```

## One-time migration (current live build → releases root)
```
DRY_RUN=1 ./migrate_current_to_releases.sh     # preview — COPIES ONLY
DRY_RUN=0 ./migrate_current_to_releases.sh
```
- Copies (does not move) `/home/tuah/tuah2/.next` into
  `releases/20260829-2023-qaQdu5Dx-legacy/` and writes BUILD_INFO.json with
  `provenance_kind="asserted-inferred"`.
- **Does NOT restart PM2, does NOT modify the serving dir.** Zero downtime.
- Honest caveat: the adopted release's commit (`ccc1be08…`) is **inferred**, not proven.

## How it answers the hard gate
`BUILD_INFO.json` binds `commit → build_id → artifact.sha256 → deployment_id`.
`verify_build_id.sh` asserts the **served** build id equals `BUILD_INFO.build_id`.
Therefore: given a served build id, one release dir uniquely names both the exact
artifact bytes (sha256) and the source commit that produced them.

## How it prevents the D7 failure mode
D7 = "the fix is in the working tree but was never committed" (so what runs ≠ what is
committed). `build_release.sh` **refuses to build when `git status --porcelain` is
non-empty** (unless `ALLOW_DIRTY=1`, recorded as `git_dirty:true`). The release is built
from `git rev-parse HEAD` of a pinned worktree, so artifact identity == a real commit.

## Preconditions before first real run
1. `/home/tuah/releases/src/tuah2` must be a clone/worktree of the canonical repo pinned
   to the intended commit (currently the server only has ad-hoc worktrees; the repo is
   `git@github.com:gantiansoh-ux/tuah2.git`).
2. `JWT_SECRET` for build time is sourced from the live process env (`/proc/<pid>/environ`),
   never committed.
3. Node 20.20.2, Next 14.2.15 (matches live).
