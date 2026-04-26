# Roadmap — composition-engine work

This document captures the remaining steps in the redesign that
introduced the composition engine (capability tags, predicate-based
adapters, verticals). Steps 1, 2, A1, and A2 are landed (see
`git log --grep 'feat(composition)\|feat(walking-skeleton)\|feat(cli)'`).
What follows is the punch list to retire the legacy engine.

## A3 — Gradle wrapper adapter

**Goal.** The `walking-skeleton` vertical currently emits a Gradle
multi-module project but no wrapper, so the user has to install
Gradle separately. Port the legacy `gradle-wrapper` schematic onto
the new contract so the project is runnable with `./gradlew` out of
the box.

**Adapter.** `walking-skeleton/gradle-wrapper`

- `vertical: 'walking-skeleton'`
- `covers: ['build-tool']` — add `'build-tool'` to
  `walkingSkeletonVertical.dimensions`
- `predicate: { requires: ['pkg.gradle'] }` — fires whenever the
  project uses Gradle, regardless of language/framework
- `after: ['walking-skeleton/quarkus-cli-bootstrap']` — runs after
  the bootstrap so the project shell exists
- No questions — the wrapper is fully opinionated
- `contribute()` returns `{ files: [...] }` rendering:
  - `gradlew` (executable, mode `0o755`)
  - `gradlew.bat`
  - `gradle/wrapper/gradle-wrapper.properties`
  - `gradle/wrapper/gradle-wrapper.jar` (binary — copy verbatim)

**Where the assets come from.** The legacy schematic lives at
`assets/schematics/gradle-wrapper/`. Copy the jar and shell scripts
into `assets/composition/walking-skeleton/gradle-wrapper/templates/`,
preserving the executable bit on `gradlew`.
`renderTemplateFiles` already preserves it — see
`src/composition/render.ts`.

**Tests.** Add to `tests/composition/verticals/walking-skeleton.test.ts`:

- The wrapper files exist after install.
- `gradlew` has `mode === 0o755`.
- `gradle-wrapper.jar` is byte-identical to the source.

**Commit.** `feat(walking-skeleton): port gradle-wrapper as adapter`

---

## B — Distribution vertical (`distribution/quarkus-cli-native`)

**Goal.** First non-skeleton vertical. Proves the brownfield
`keel add <vertical>` story and the `tagsAdd` chain (this vertical
promotes `runtime.graalvm-native`, which a future observability
vertical would key on for native-image-aware OTel wiring).

**Vertical.** `distribution`

- `id: 'distribution'`
- `description: 'How this project ships.'`
- `dimensions: ['build', 'release-channel']`
- `adapters: [quarkusCliNativeAdapter]`

**Adapter.** `distribution/quarkus-cli-native`

- `covers: ['build', 'release-channel']`
- `predicate: { requires: ['framework.quarkus', 'arch.cli', 'pkg.gradle'] }`
- One sticky question:

  ```ts
  {
    id: 'targets',
    prompt: 'Which native targets to build?',
    doc: 'GraalVM cross-compiles per OS/arch; CI builds one job per target.',
    default: 'linux-amd64,linux-arm64,darwin-arm64',
    memory: 'sticky',
    choices: [
      { value: 'linux-amd64,linux-arm64,darwin-arm64', label: 'common 3', doc: '…' },
      { value: 'linux-amd64',                          label: 'linux only', doc: '…' },
      { value: 'linux-amd64,darwin-arm64',             label: 'linux + macOS arm', doc: '…' },
    ],
  }
  ```

- `contribute(ctx)` reads `targets`, splits on comma, renders:
  - `.github/workflows/release.yml` — matrix build over targets,
    uploads native binaries to a GitHub Release on tag push
  - `.github/workflows/native-build.yml` — PR-time smoke build of
    one target
  - Patches `infrastructure/cli/build.gradle.kts` to add the
    Quarkus native config block (or — simpler — leave the build
    file alone and pass `-Dquarkus.package.type=native` from CI)
- `tagsAdd: ['runtime.graalvm-native']`

**Templates.** Under
`assets/composition/distribution/quarkus-cli-native/templates/`:

- `.github/workflows/release.yml.ejs` — uses
  `<%= targetsList %>` (split-and-rendered as a YAML array) and
  `<%= projectName %>` from
  `ctx.manifest.answers['walking-skeleton/quarkus-cli-bootstrap']?.projectName`
  (read pattern is already in use by `sample-port-fake`).
- `.github/workflows/native-build.yml.ejs` — same source for the
  matrix value.

**Tests.** `tests/composition/verticals/distribution.test.ts`:

- Happy path: install onto a manifest carrying the bootstrap's
  tags + answers; assert workflow files exist with the substituted
  matrix; assert manifest tags now include `runtime.graalvm-native`.
- Sticky reuse: install once with default targets, then install
  again with no `--set` — second run reads the stored answer
  silently.
- Hard fail: install onto a manifest missing `arch.cli` — predicate
  filters the only adapter out, vertical's dimensions go uncovered,
  ResolutionError thrown.

**Commit.** `feat(distribution): add quarkus-cli-native vertical`

---

## C1 — `keel add` command

**Goal.** Surface the brownfield path. `keel new` creates a project
from a stack; `keel add <vertical>` layers more verticals onto an
existing project.

**Implementation.** `src/installer/add.ts` exporting `addVertical`:

1. Read manifest at `<cwd>/.claude/.keel-manifest.json`. Error if
   absent: `keel add` requires a project initialised by `keel new`.
2. Look up the vertical by id from a registry of known verticals
   (start with `vcs`, `walking-skeleton`, `distribution` — declare
   in `src/composition/verticals/index.ts`).
3. Refuse if the vertical is already in `manifest.verticals` unless
   `--reapply` is set (initial behaviour: error with a clear
   message; reapply is a follow-up).
4. Call `installVertical` with the existing manifest, an in-memory
   Tree rooted at cwd, the supplied prompt/mode, etc.
5. Print plan; if `--dry-run`, return.
6. Otherwise: commit tree, run actions, write manifest.

**CLI wiring.** In `src/cli/main.ts`, add:

```ts
program
  .command('add <vertical>')
  .description('Install a vertical onto an existing keel project.')
  .option('-y, --yes', 'non-interactive', false)
  .option('--dry-run', 'preview the plan', false)
  .option('--set <kv...>', 'preset answer adapterId:questionId=value', [])
  .action(async (vertical, opts) => {
    await addVertical({
      cwd: process.cwd(),
      vertical,
      answers: parseSetAnswers(opts.set),
      interactive: !opts.yes,
      dryRun: opts.dryRun,
    });
  });
```

**Tests.** `tests/composition/add.test.ts`:

- After `keel new --stack=quarkus-cli`, `keel add distribution` lands
  the workflow files and updates the manifest.
- `keel add distribution` twice in a row errors on the second.
- `keel add nonsense-vertical` errors with a clear message listing
  available ids.
- `keel add` against a directory without a manifest errors with
  "no project initialised" guidance.

**Commit.** `feat(cli): add keel add for brownfield vertical install`

---

## C2 — Retire the old engine

**What to delete.**

- `src/engine/types.ts` — legacy Schematic / Engine / Context port
  types.
- `src/engine/homegrown.ts` — legacy engine + cliPrompt.
- `src/engine/template.ts` — legacy renderTemplate (replaced by
  `src/composition/render.ts`).
- Keep `src/engine/tree.ts` for now (used by composition); move it
  to `src/composition/tree.ts` in the same commit and update
  imports. Or leave it where it is and just delete the rest of
  `src/engine/` — your call.
- `src/schematics/` — entire directory (claude-core, claude-quarkus,
  walking-skeleton, port, scenario, gradle-wrapper, executable-rest,
  iac-cloudrun, ci-github, git-init, registry.ts, util.ts).
  - **Watch:** `packageToPath` etc. in `src/schematics/util.ts` are
    used by composition adapters. Move them to
    `src/composition/util.ts` before deleting.
- `src/installer/install.ts`
- `src/installer/update.ts`
- `src/installer/doctor.ts`
- `src/installer/plan.ts`
- `src/installer/profile.ts`
- `src/installer/env.ts`
- `src/manifest/schema.ts` — v1 schema. The v2 reader migrates v1
  manifests in memory; once the legacy installer is gone, the
  migration helper can stay (in case users still have v1 manifests
  on disk) but the v1 _write path_ dies. Concretely: delete
  `src/manifest/store.ts` (legacy reader/writer), keep
  `src/manifest/schema-v2.ts` and `src/manifest/store-v2.ts`. Move
  `MANIFEST_FILENAME` and the v1 `ManifestSchema` (still needed by
  `parseManifest` for migration) into `schema-v2.ts`, then delete
  `schema.ts`.
- All legacy schematic tests under `tests/`:
  `ci-github-schematic.test.ts`, `claude-core-schematic.test.ts`,
  `claude-quarkus-schematic.test.ts`, `engine.smoke.test.ts`,
  `env-preflight.test.ts`, `executable-rest-schematic.test.ts`,
  `git-init-schematic.test.ts` (legacy version — the new one lives
  at `tests/composition/adapters/git-init.test.ts`),
  `gradle-wrapper-download.test.ts`, `gradle-wrapper-schematic.test.ts`,
  `iac-cloudrun-schematic.test.ts`, `install.test.ts`,
  `port-schematic.test.ts`, `profile.test.ts`,
  `scenario-schematic.test.ts`, `update.test.ts`,
  `walking-skeleton-schematic.test.ts`.
- `assets/schematics/` — all legacy template assets. Confirm
  nothing under `src/composition/` or `assets/composition/` still
  references them, then delete.
- `src/util/paths.ts`: drop the `'schematics'` AssetKind and the
  `claudeCoreTemplates()` helper. Keep `'composition'`.

**CLI cleanup.** In `src/cli/main.ts`, remove the `install`,
`update`, `doctor`, and `generate` commands. The CLI ends up with
just `new` and `add`.

**Imports to clean.** After deletes, run `pnpm typecheck` — any
dangling imports surface immediately. Common culprits:

- `cliPrompt` from `engine/homegrown.js` (none should remain after
  CLI trim — composition has its own `cliPrompt` in
  `src/composition/answers.ts`).
- `Schematic`, `Engine`, `PromptSchema` types (legacy contract).

**Docs to update.**

- `README.md` — the install/update flow section. Replace with `keel
new` + `keel add` examples. Drop references to `keel install`.
- `CLAUDE.md` (project root) — §5 (`Dev workflow`) mentions `keel
install`/`keel update`/`keel generate`. Update the CLI reference.
  §6 (Repository layout) — adjust the `src/` tree to reflect the
  retirement.
- `assets/schematics/claude-core/templates/CLAUDE.md` — when this
  asset is deleted, the binding spec lives only as the model the
  walking skeleton dogfoods. Either:
  - Move the binding spec to `assets/composition/claude-core/templates/CLAUDE.md`
    and add an adapter that emits it (`walking-skeleton/claude-core`,
    covers `'agentic-baseline'`); or
  - Inline the conventions into the bootstrap adapter's emitted
    `CLAUDE.md`.

  I'd pick the first (separate adapter) so it composes the same way
  everything else does.

- `CHANGELOG.md` — add an `Unreleased` entry covering the
  composition engine, `keel new`, `keel add`, and the legacy
  retirement.

**Tests to add (replacing what was deleted).**

- The composition test suite should already cover the surface area
  the legacy schematic tests used to (verify by running
  `pnpm test`). Anything not covered: write new tests in
  `tests/composition/`.

**Order of operations to keep gates green throughout.**

1. Move `packageToPath` and friends from `schematics/util.ts` to
   `composition/util.ts`. Update imports. Run gates.
2. Move v1 schema bits needed for migration into `schema-v2.ts`.
   Delete `manifest/schema.ts` and `manifest/store.ts`. Run gates.
3. Delete `installer/install.ts`, `update.ts`, etc. Trim CLI to
   remove the dead commands. Run gates.
4. Delete `src/schematics/` and `assets/schematics/`. Run gates.
5. Delete `src/engine/types.ts`, `homegrown.ts`, `template.ts`.
   Move `tree.ts` if you want — or leave it, it's the only file
   left in `engine/`. Run gates.
6. Delete legacy tests under `tests/` (everything not under
   `tests/composition/`). Run gates.
7. Refresh README and CLAUDE.md. Run gates.

**Commits.** Each numbered step above can be one commit. Or bundle
them — the important thing is that gates stay green between
commits, so a future bisect lands on a working state.

`chore(retire): drop legacy engine and schematics`
`docs: refresh README and CLAUDE.md for the composition engine`
`chore(release): v0.4.0-alpha`

---

## After C2

The repo's `src/` layout becomes roughly:

```
src/
  cli/                  — main.ts (just `new` and `add`)
  composition/          — types.ts, predicate.ts, resolver.ts,
                          answers.ts, apply.ts, install.ts,
                          render.ts, actions.ts, stacks.ts,
                          util.ts, tree.ts (?)
  composition/adapters/ — git-init, quarkus-cli-bootstrap,
                          sample-port-fake, gradle-wrapper,
                          quarkus-cli-native
  composition/verticals/— vcs, walking-skeleton, distribution,
                          index.ts (registry)
  installer/            — new.ts, add.ts
  manifest/             — schema-v2.ts, store-v2.ts
  util/                 — log.ts, hash.ts, paths.ts (no schematics
                          asset kind)
```

That's the end state. Anything beyond — observability vertical,
REST entrypoint adapter, more stacks — fits cleanly on top.
