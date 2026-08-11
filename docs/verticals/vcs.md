# `vcs` — version control bootstrap

Initialises a git repository and optionally registers an `origin`
remote. Installed by default on **every stack**; it is why a
scaffolded project is a repo before its first file lands.

## What it does

- `git init` on the requested **default branch**.
- Optionally `git remote add origin <url>` when a remote is given.
- Detects an existing repository and does not re-initialise it —
  brownfield-safe.

## Dimensions & adapters

| Dimension | Adapter        | Predicate                 |
| --------- | -------------- | ------------------------- |
| `vcs`     | `vcs/git-init` | none — applies everywhere |

## Questions

| Question        | Notes                                           |
| --------------- | ----------------------------------------------- |
| `origin` remote | Optional URL; skipped silently when left empty. |
| Default branch  | The branch `git init` starts on.                |

Answers are **sticky**: recorded in the manifest, never re-asked on
subsequent keel runs.

## Prerequisites

| Requirement   | Why                               |
| ------------- | --------------------------------- |
| `git` on PATH | All work is done via the git CLI. |

## Related

- [Verticals catalog](README.md) · [CLI reference](../cli.md)
