---
description: Stage, verify, and create a Conventional Commit; push to trunk.
---

Run the full commit pipeline for the current diff:

1. Show `git status` and `git diff --stat` so the user can confirm scope.
2. If there is nothing to commit, say so and stop. Do not create empty commits.
3. Scan the diff and verify the change is a **single logical unit**. If it mixes
   refactor + feature + fix (or similar), stop and suggest running `/micro` to
   split; do not proceed without the user's explicit agreement.
4. Run the project's verification pipeline (the pre-commit hook will also run,
   but do it explicitly so failures are surfaced):
   - Gradle: `./gradlew check`
   - pnpm: `pnpm run typecheck && pnpm run test`
   - Cargo: `cargo clippy -- -D warnings && cargo test`
   - Go: `go vet ./... && go test ./...`
   - OpenTofu: `tofu fmt -check && tofu validate`
     Run every stack the repo contains. Fail the command on any red.
5. Draft a Conventional Commit message:
   - Format: `<type>(<scope>): <subject>`
   - Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `build`, `ci`,
     `perf`, `style`.
   - Scope: the module or aggregate touched (e.g. `domain/user`, `cli`,
     `infra/postgres`). Omit if the change is repo-wide.
   - Subject: imperative, lowercase, no trailing period, under 72 chars.
   - Body (optional): explain _why_, not _what_. Wrap at 80.
   - Never include task IDs, author tags, or session URLs.
6. Show the proposed message; confirm with the user if any doubt.
7. `git add` the staged files (never `git add -A` blindly — show a list first
   and refuse to stage `.env`, credentials, or large binaries).
8. `git commit -m "<message>"` via HEREDOC.
9. `git push -u origin <current-branch>`. Retry up to 4 times with
   exponential backoff (2s, 4s, 8s, 16s) on network errors.
10. Report the resulting commit SHA.

**Never** `--no-verify`, `--force`, or amend an already-pushed commit
without explicit user instruction.
