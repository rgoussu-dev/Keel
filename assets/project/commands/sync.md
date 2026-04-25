---
description: Pull latest from trunk with rebase; surface conflicts.
---

Sync the working tree with the remote trunk. Trunk-based flow requires
frequent syncs to keep divergence small.

1. Fail fast if the working tree is dirty — `git status` must be clean. If
   it isn't, stop and tell the user to commit (via `/commit`) or stash
   first. Do **not** stash silently on their behalf.
2. Identify the trunk branch: typically `main`. If the current branch is
   not `main`, warn — keel projects are trunk-based and should commit to
   `main` directly.
3. `git fetch origin <branch>` (retry up to 4 times with exponential
   backoff on network failure).
4. `git pull --rebase origin <branch>`.
5. If the rebase raises conflicts, stop and show each conflicted file.
   Resolve conflicts **with the user**, not unilaterally — trunk-based
   conflicts usually mean two people touched the same hot spot and need to
   agree on the resolution.
6. After a clean rebase, run the verification pipeline (same as `/commit`
   step 4). Fail loud if anything breaks post-rebase.
7. Report the new HEAD SHA and the number of commits pulled in.
