# Agent conventions — assets

<!-- keel:purpose: everything shipped to a scaffold: template trees, the binding spec, the `keel ui` page, version pins -->

What lives here: everything keel ships to a scaffolded project, none of
it compiled.

- **`composition/`** — adapter template trees (ejs), one directory per
  `<vertical>/<adapter>/`, plus shared trees several adapters render
  (`walking-skeleton/jvm-domain/`). A `*-modulith` sibling tree is the
  same content under the modulith module layout, picked by the
  manifest's `layout.*` tag.
- **`project/AGENTS.md`** — the binding spec, source of truth for the
  universal engineering conventions every keel-scaffolded project
  follows, emitted verbatim by `agent-harness/claude-core`. Editing it
  changes what every scaffold preaches; the golden test for the emitted
  harness is what catches an accidental edit.
- **`web/`** — the `keel ui` page: framework-free custom elements on
  `@rgoussu.dev/planks`, served as-is (no bundler). `src/finder.js` walks
  the drill-down tree, `src/steps.js` says which steps the rail has, and
  `src/target.js` says how a change moves the run — which of the
  target, the answers, the dials and the request generation it clears,
  which dials a new preset carries, what the line under the preset
  picker says a move could not keep, and which boxes an "Also
  scaffold" tick moves (`toggleExtra`: a tick brings what the vertical
  needs, an untick takes what needs it) — `src/extras.js` sorts
  that group into its parts from the `keel.dials` reply, and
  `src/project.js` says what the project status reports once for every
  card (a harness from another generation).
  All pure, all unit-tested without a browser. Linted with `src` and
  `tests`, unlike the ejs template trees.

## Version pins are a registry, not a grep

`composition/version-pins.json` registers every framework and tool
version the templates pin — BOMs, wrappers, toolchain majors, image
tags, action refs — both in this directory and in the
`src/domain/core/adapters/` sources that embed template content.
`tests/version-pins.test.ts` guards it in `verify` the way
`ci-workflow.test.ts` guards the shard matrix: registry ↔ templates must
agree, and a sweep fails on any pin-shaped string no entry claims.
**Extend the registry, never the sweep's blind spots.**

Bumping a pin is a human-reviewed change that updates the template(s)
and the registry together, proved by the e2e grid. The weekly drift
report that compares each entry against its upstream latest stable is
`version-currency.yml` — see [`.github/`](../.github/AGENTS.md).

This file and its `CLAUDE.md` pointer are keel's own contributor notes
and are excluded from the published tarball (`package.json` → `files`);
everything else in this directory ships.
