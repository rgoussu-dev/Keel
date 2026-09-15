# Agent conventions — docs

<!-- keel:purpose: the depth behind the README, and the split-changelog convention -->

What lives here: the comprehensive documentation. `stacks/` is one page
per stack family (prerequisites, questions, generated tree);
`verticals/` is one page per vertical plus the compatibility matrix;
`releases/` holds the cut changelog files. Alongside them:
`cli.md`, `composition.md`, `plugins.md`, `ui.md`, `development.md`,
`release.md`, `roadmap.md`.

**A new stack, vertical or CLI flag updates the matching page(s) and the
README matrix in the same change.** A doc landing a release later is a
doc that was never written.

## Where each kind of prose belongs

- **`README.md`** (repo root) is the engaging front door — quickstart,
  stack matrix, per-family "How to" sections, verticals table. Keep it
  scannable; depth belongs here.
- **`docs/`** is the depth. Contribution workflow (forks) lives in
  `CONTRIBUTING.md`, not here.
- **`AGENTS.md`** files are conventions for contributors, one per
  directory that has any, indexed from the root map. `CLAUDE.md` beside
  each is only the pointer stub — never put content there.
- **Public API docs** are TSDoc `/** … */` on every exported symbol in
  `src/`, not a page here.

## CHANGELOG.md

[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), with one
deliberate deviation — the split Kubernetes and Node.js use: released
sections live one file per release under `docs/releases/CHANGELOG.<version>.md`,
each carrying its own compare link, and the root keeps `[Unreleased]`
plus a newest-first `## Releases` index.

- Every user-visible change goes under `[Unreleased]` with the
  appropriate category (`Added`, `Changed`, `Deprecated`, `Removed`,
  `Fixed`, `Security`).
- At release time `scripts/cut-changelog.mjs` moves the `[Unreleased]`
  body verbatim into the new release file and leaves a fresh empty
  `[Unreleased]`.
- `tests/changelog.test.ts` guards the shape in `verify`.
- **A cut file is frozen once its version is tagged.**
