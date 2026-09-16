# `vcs` — version control, and the conventions that keep it readable

Installed by default on **every stack**; it is why a scaffolded
project is a repo before its first file lands. Three dimensions, one
subject: how this project records what changed and why.

| Dimension            | Adapter                  | What it emits                                                                                                    |
| -------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `vcs`                | `vcs/git-init`           | The repository itself: `git init -b <branch>`, and `origin` when you give one.                                   |
| `commit-conventions` | `vcs/commit-conventions` | `.githooks/commit-msg` — a Conventional Commits gate in POSIX `sh` — and the `core.hooksPath` that activates it. |
| `changelog`          | `vcs/changelog`          | `CHANGELOG.md` (`[Unreleased]` + release index), `docs/releases/`, and `scripts/cut-changelog.sh`.               |

The two conventions are **individually declinable**: each asks one
sticky yes/no question, defaulting to yes, and emits nothing when the
answer is no.

```sh
keel new --stack=go-http --set vcs/commit-conventions:commitHook=no
keel new --stack=go-http --set vcs/changelog:changelog=no
```

## The repository

- `git init` on the requested **default branch**.
- Optionally `git remote add origin <url>` when a remote is given.
- Detects an existing repository and does not re-initialise it —
  brownfield-safe.

## The commit gate

The binding spec already mandates Conventional Commits. A rule stated
in a document is a rule an agent reads once and drifts from ten
commits later; a `commit-msg` hook is the same rule with a gate in
front of it, and it refuses the commit before the drift lands.

```
commit-msg: the subject line is not a Conventional Commit.

  got       added a thing and fixed another
  expected  <type>[(<scope>)][!]: <description>
  types     build chore ci docs feat fix perf refactor revert style test

  feat(orders): accept a partial shipment
  fix!: reject an empty basket          (the ! marks a breaking change)

One commit is one logical unit; if the subject needs an "and", it is
two commits. https://www.conventionalcommits.org/en/v1.0.0/
```

Three decisions worth knowing:

- **POSIX `sh` and `grep`, nothing else.** A scaffolded Go, Rust or
  JVM project cannot assume Node on the machine, so commitlint and
  husky are out — the check is a regular expression over the subject
  line, which is all the spec's grammar needs.
- **Not a Claude Code hook.** git already refuses the commit and puts
  the reason on stderr, which is exactly where an agent reads it, so a
  `PreToolUse` gate would spend a slot of the
  [reminder budget](agent-harness.md) re-stating what the agent is
  about to be told anyway. What the harness half would have bought is
  bought instead by the message above. The hook is ordinary domain
  content, and a project that installed no harness still gets it.
- **Tracked, not hidden.** `.git/hooks/` is per-clone and untracked; a
  rule that exists only on the machine that ran the scaffold is not a
  project convention. The script lives in `.githooks/`, which is
  committed, and `core.hooksPath` points git at it. keel sets that for
  the directory it scaffolds; each later clone runs the one-liner
  itself, which `.githooks/README.md` states. A repository that
  already points `core.hooksPath` somewhere else keeps it, with a
  warning — the same brownfield posture `vcs/git-init` takes.

Deliberate non-refusals: a merge, revert, fixup, squash or amend
subject is git's own wording rather than the author's, and an empty
subject is a commit git is about to abort by itself.

## The changelog

The split convention keel itself follows: released sections live one
file per release under `docs/releases/`, each with its own compare
link, and the root keeps `[Unreleased]` plus a newest-first index. It
is what Kubernetes and Node.js do, for their reason — a single-file
changelog that a long-lived project appends to stops being read long
before it stops being written.

```sh
scripts/cut-changelog.sh 1.2.0        # or: … 1.2.0 2026-09-15
```

The cut moves the `[Unreleased]` body verbatim into
`docs/releases/CHANGELOG.1.2.0.md`, leaves a fresh empty
`[Unreleased]`, and prepends the release to the index. It refuses to
cut twice, and refuses an empty `[Unreleased]`.

- **The cut rides POSIX `sh` and `awk`, not keel and not Node.** keel's
  own cut is a Node script, which is fine for a Node repository;
  cutting a release is the one moment you least want a missing
  runtime, and `npx @rgoussu.dev/keel` would add a network round trip
  to a release. So the scaffold carries its own implementation of the
  same rules.
- **The compare links come from the git remote at cut time**, not from
  an answer: the remote is where the tags actually are, and a project
  with no remote gets no links rather than wrong ones.
- **One source of truth for the shape.** The emitted template and
  keel's own `CHANGELOG.md` are checked against the same structural
  rules (`tests/support/changelog-shape.ts`) in `verify`, which is
  what keeps "matches keel's own" a fact rather than a claim.
- **A cut file is frozen once its version is tagged**: it records what
  that release contained, not what anyone later wished it had.

## Questions

| Question        | Adapter                  | Notes                                                     |
| --------------- | ------------------------ | --------------------------------------------------------- |
| `remote`        | `vcs/git-init`           | Optional URL; skipped silently when left empty.           |
| `defaultBranch` | `vcs/git-init`           | The branch `git init` starts on.                          |
| `commitHook`    | `vcs/commit-conventions` | `yes` (default) emits the gate; `no` emits nothing.       |
| `changelog`     | `vcs/changelog`          | `yes` (default) emits the convention; `no` emits nothing. |

Answers are **sticky**: recorded in the manifest, never re-asked on
subsequent keel runs.

## Prerequisites

| Requirement   | Why                                                               |
| ------------- | ----------------------------------------------------------------- |
| `git` on PATH | The repository, the remote, and `core.hooksPath`.                 |
| POSIX `sh`    | Runs the commit gate and the cut; no Node, jq or Python anywhere. |

## Related

- [`agent-harness`](agent-harness.md) — the document that states the
  commit convention the gate enforces.
- [Verticals catalog](README.md) · [CLI reference](../cli.md)
