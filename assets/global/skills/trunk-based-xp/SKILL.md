---
name: trunk-based-xp
description: |
  Use when committing in a keel-governed project, deciding whether to
  branch, or checking that a unit of work is actually "done". TRIGGER on
  git commit discussions, branch decisions, "done" claims, mob/pair
  programming questions, and Conventional Commits formatting questions.
  SKIP for code-content questions (covered by hexagonal-review,
  mediator-pattern, test-scenario-pattern).
---

# trunk-based-xp

keel projects use trunk-based development with Extreme Programming
practices. Branches and pull requests are the exception, not the default.

## Workflow rules

- **No branches in consumer projects.** Commit to `main` in small,
  logical units. The keel repo itself is an explicit exception: it
  ships via Claude Code cloud sessions, which require feature branches
  per session (see the keel repo root `CLAUDE.md`, §2). Consumer
  projects do not have that exception.
- **No pull requests in consumer projects.** Integration is continuous
  on `main`. The keel repo itself uses pull requests as part of the
  same cloud-session exception described above (see the keel repo root
  `CLAUDE.md`, §2 and §4); consumer projects do not.
- **Feature flags** let incomplete work ship dark and keep parallel work
  from interfering. Reach for a flag whenever a change is too large to
  land green in one commit.
- **Conventional Commits** format for every commit
  (https://www.conventionalcommits.org/en/v1.0.0/).
- **Frequent sync** with `git pull --rebase` is mandatory. Stale local
  branches break the trunk-based model.
- **Pair / mob programming** is the default for non-trivial work.

## Commit discipline

- One commit = one logical unit of work. **Never mix refactor + feature +
  fix.** If a refactor is needed to unblock a feature, the refactor is
  its own commit, landed first.
- Every commit passes: format, typecheck, lint, unit tests, public-API
  docs check. Not "the final commit before push" — _every_ commit.
- A commit that breaks trunk must be rolled back within minutes.
  Forward-fix only when it is safely faster than reverting.

## "Done" means

A unit of work is done when **all** of the following hold:

1. Code is formatted and lints clean.
2. Typecheck passes.
3. Tests (unit + affected integration) pass.
4. Mutation score is not regressed.
5. Public API has docs (see the `public-api-docs` skill).
6. Architecture boundaries hold (see the `hexagonal-review` skill).
7. Committed in Conventional Commits format, pushed to trunk.

**Never claim "done" without having actually run steps 1–4.** If the
environment prevents running them, say so explicitly rather than
asserting success.

## Anti-patterns

- "I'll squash later" commits that mix refactor and feature. Wrong — land
  the refactor first as its own commit.
- "Tests can wait, this is just plumbing." Wrong — the walking skeleton
  is plumbing and it is fully tested. So is every later increment.
- A long-lived feature branch outside the cloud-session exception. Wrong
  — break the work into flagged increments and integrate continuously.
- Skipping pre-commit hooks "because the formatter is annoying". Wrong —
  fix the formatter config or the underlying issue. The hook is the gate
  that makes trunk safe to commit to.
