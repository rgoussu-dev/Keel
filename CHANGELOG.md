# Changelog

All notable changes to `@rgoussu.dev/keel` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Declared compatibility: one rule, read twice.** A `Conflict` names
  a combination of capability tags that must never be assembled, and
  why — `{ when: ['a', 'b'] }` for a mutual exclusion,
  `{ when: ['a'], unless: ['b'] }` for a requirement spelled as its
  violation. The evaluation is a `Predicate`'s exactly, with the
  polarity flipped: same glob grammar, same matcher, no second one to
  drift.
  - **Refused loudly.** `keel new` checks the tag set its dials
    settled against every rule the stack and its verticals declare,
    after the last dial and before the first file; `keel add` asks the
    same of a vertical against the manifest's tags. Both report every
    violation with the rule's own sentence, the tags that matched and
    the rule id, under `keel.incompatible`.
  - **And filtered, from the same sentence.** Every menu narrows by
    the rules as answers land — build system, module layout, peer
    context, `--with` verticals, and the stack drill-down, whose three
    steps are guarded at once because they are one walk over the same
    set. `keel.catalog` reads the same filter, so `keel ui`'s facets
    and the terminal wizard offer the same presets. A preset is hidden
    only when _every_ setting of its dials is refused.
  - **Declared by the piece that owns the rule** — a vertical or a
    stack, never a central table — so a preset or vertical supplied
    from outside this repository brings its own rules. `Stack` and
    `Vertical` both gained a `conflicts` field.
  - The first rule to move is the peer context's: `--with-peer-context`
    needs the modulith layout. It was a hand-written branch, which is
    why the refusal existed and the menu did not — the choice was
    offered under the flat layout and then rejected. Its error code
    changes from `keel.invalid-peer-context` to `keel.incompatible`;
    the separate "this stack has no peer-context adapter" refusal keeps
    the old code, and now asks its question against the layout that
    creates the seam, so a stack that could never carry one is told so
    rather than sent to change layout first and still get nothing.

### Changed

- **`keel add module` refuses the flat layout by declaration now, and
  the form greys the control out by the same sentence.** The rule that
  a bounded context needs the modulith layout was a branch in the
  handler _and_ a second hand-written copy in `canAddModule` — two
  statements of one fact, in the arrangement where a refusal and a
  control drift apart. It is now
  `bounded-context/context-needs-modulith`, declared on the
  `bounded-context` vertical and read from both ends. The refusal's
  error code changes from `keel.invalid-module` to `keel.incompatible`
  and it gains the rule id and the tag that matched; the other six
  front-door refusals keep `keel.invalid-module`.

- **The resolver's thrown refusal now says what the front door says.**
  `resolveVertical` reported only which dimension was empty, while
  `coverageGap` — added for the `--with` front door — could already
  name the tags that would close it. The throw is built from that same
  gap now (`would need arch.server-http`, and `detail.enablers`
  alongside `detail.dimensions`), so the refusal a user runs into and
  the one they are shown ahead of time cannot differ.

- **`keel ui` gets the drill-down too, as facets.** The page's stack
  picker was a flat select over every preset; above it now sit the
  same three narrowing controls `keel new` asks as questions —
  language, user-side adapters (a checkbox group), framework — each
  re-filtering the others and resolving to a preset. Ticking both
  adapters gives the composed preset, emptying the group is refused
  rather than resolved, and moving one facet keeps the others where
  the new choice still offers them (Java → Kotlin with CLI + HTTP on
  Spring lands on `spring-cli-rest-kotlin`).
  - **The grid is reported, not re-derived.** `keel.catalog` gained a
    `finder`: a tree of language → entrypoint combination → framework,
    each leaf naming a preset, built by the same `stack-wizard.ts`
    functions the terminal wizard asks from. The page walks the tree
    and never sees a capability tag — a page deriving the grid from
    `stacks[].tags` would be a second implementation of a vocabulary
    that is not its to know, and would drift from the terminal's the
    first time a tag moved.
  - The **Stack** select stays: it shows the result, it picks a preset
    by name, and it is the only route to a fullstack product, which
    names no language and so appears in no facet.
  - **The blank form now opens on `quarkus-cli`** — the preset an
    omitted `--stack` resolves to, reported whole as
    `finder.defaultStack`. It previously opened on `fullstack`, the
    alphabetically first entry of the catalog, which is the last thing
    a blank form should presume.

- **The `keel ui` facets, driven in a real browser.**
  `tests/e2e/ui-stack-finder.test.ts` spawns `keel ui --port 0`, reads
  the URL and token it prints, and drives the page with Playwright.
  The narrowing was unit-tested and the catalog DTO was tested, but
  nothing had ever loaded the page: the facets were verified by hand
  in Chromium once and never again. What only a browser can see is
  the part between the two — `<keel-new-form>` rebuilds its subtree on
  every change and `<keel-app>` replaces the element itself, so every
  claim about keeping a choice is a claim about surviving a DOM
  replacement.
  - **Eight cases**: the form opens on `quarkus-cli` rather than the
    catalog's alphabetically first entry; a language move keeps the
    entrypoints and framework (including off their defaults, where a
    dropped carry-over is otherwise invisible); ticking the second
    adapter gives the composed preset and never a two-service product;
    clearing the last checked adapter is refused and the control snaps
    back; `go` drops the framework facet and `typescript@browser`
    drops both; and the `fullstack` product shows the language
    placeholder and comes back out of it. A `pageerror` or a
    `console.error` anywhere in a case fails it.
  - The refusal case clicks the checkbox for real rather than calling
    Playwright's `uncheck()`, which would time out for precisely the
    reason the case exists — the handler puts the box back.
  - Rides the existing `web` shard, which already declares
    `browser` in `tools:`, and finishes inside that shard's floor
    rather than becoming it.

- **`keel new --with`, and the wizard's fourth step: extra verticals
  in the same run.** `NewProjectCommand.extraVerticals` existed only
  for a composite stack's services; the single-service path never
  threaded it. It does now, as a flag (`--with distribution,ci`) and
  as the wizard's last stack-level question — a multi-select
  defaulting to none. Layering here is not the same as running
  `keel add` once per vertical afterwards: in one run the extras
  resolve against one another's tags, and the review step shows one
  plan instead of four.
  - **The menu is pruned twice**: the stack's own verticals are off it
    (the stack installs them either way), and so is anything this
    project cannot cover — `persistence` on a CLI-only preset resolves
    to nothing and would hard-fail at install. The new
    `coversFor(vertical, tags)` in `domain/core/resolver.ts` is the
    resolver's own coverage check asked ahead of time and answered
    rather than thrown; the question comes last among the stack dials
    so it can be pruned against what the other three settled.
  - `--with` suppresses the question, `--with ''` included — that is
    how a script says "none" explicitly. Unknown ids and ids the stack
    already carries are refused at the front door with the available
    list spelled out. Rejected on composite stacks, whose services
    declare their own extras and where `--with` names no service.
  - **An uncoverable id is refused there too**, rather than reaching
    the resolver's throw after every other question has been asked.
    `keel new --stack=quarkus-cli --with persistence` now says which
    dimension no adapter covers and which tag would have covered it
    (`arch.server-http`) — the fact the menu's pruning states by
    omission, said out loud. `coverageGap(vertical, tags)` is
    `coversFor` with that reason attached; it reports the unmet
    `requires` of the adapter _nearest_ to matching, not of every
    stack shape keel supports.
  - **The check walks the extras the way the install runs them** — in
    the order named, each against the tags its predecessors promote —
    because a flat probe would refuse the compositions `--with`
    exists for. `--with containerization,distribution,iac` is legal
    on a REST stack (`iac` is keyed on the `dist.container-image` tag
    `distribution` promotes); the same three ids in another order are
    refused naming the one to list it after, not called impossible.
  - `keel.preview` binds the answer as `{ kind: 'extraVerticals' }`
    and `NewProjectTarget` carries the list, so `keel ui` round-trips
    it like any other dial.

- **`Vertical.promotes`: what installing a vertical may add to the
  tag set.** The union over its adapters' `tagsAdd`, including the
  ones only some answers produce (either container-image flavor,
  every SQL engine, either CI provider). A tag promoted at install
  time was invisible to anything reasoning before the install, which
  is what a front-door coverage check has to do; this is the static
  half of that answer. Over-declaring only defers a refusal to the
  resolver, and under-declaring would refuse a legal composition — so
  the installer checks each contribution's `tagsAdd` against the
  declaration and throws on a tag no vertical claims, which keeps the
  two from drifting apart in silence.

- **`keel new` finds your stack for you: a guided drill-down.** There
  are 33 presets, and knowing you want "Kotlin, a CLI and an HTTP
  endpoint, on Spring" is much easier than knowing that is spelled
  `spring-cli-rest-kotlin`. Run `keel new` with no `--stack` and the
  wizard now asks three narrowing questions instead of one flat menu
  of ids: **language → user-side adapters → framework**.
  - **The adapter step is a multi-select, and picking two means the
    composed preset** — one project, one domain, both entrypoints
    (`quarkus-cli-rest`, `go-cli-http`, `ts-cli-http`) — never two
    services. The question says so, and the run prints the preset it
    resolved to (`keel new: Java + CLI + HTTP server + quarkus →
quarkus-cli-rest`) rather than leaving it to be inferred.
  - **The framework step is asked only where a choice remains** —
    Quarkus/Spring/Micronaut on the JVM. Go, Rust and TypeScript are
    never asked, and the browser target skips the adapter step too,
    reaching one combination.
  - **Every menu is derived from the catalog's tags**
    (`domain/core/stack-wizard.ts`), so a preset added tomorrow
    appears by itself, and a combination no preset covers is never on
    offer — the wizard cannot walk you into a dead end and announce it
    at the bottom. The language node is qualified by the runtime,
    which is what separates `ts-cli` from `web-components` and keeps
    the SPA out of a checkbox it could not be combined from. Where a
    language's entrypoint subsets are ever incomplete, the step falls
    back to spelling the combinations out.
  - **The answer is always a registered stack id**, so `--stack` and
    the drill-down resolve through exactly the same path from there
    on, and every step is reviewable and re-answerable at the wizard's
    review step like any other question. `--stack` skips all three;
    `--yes` stays fully non-interactive. Taking every default lands on
    `quarkus-cli`, the preset an omitted `--stack` has always meant.
  - **The fullstack products keep their route**: they name no single
    language, so the language menu's last entry falls through to the
    flat list of every preset.

- **Multi-select questions on the `Prompt` port.** A `Question` may
  now declare `kind: 'multi-select'`, and the terminal adapter renders
  it as an inquirer `checkbox` instead of a `select`. The answer stays
  a **string** — the chosen values comma-joined, with
  `encodeSelection` / `decodeSelection` in
  `domain/contract/composition.ts` at both ends — so `Prompt.ask`
  still returns `Promise<string>` and nothing that consumes an answer
  had to move: sticky memory, `--set adapterId:questionId=value`, the
  wizard's replay, and `keel ui`'s form all keep working unchanged. A
  non-empty `default` reads as "at least one is required" and the
  checkbox enforces it. `keel.preview` reports the `kind` alongside
  the choices, and the `keel ui` question list renders a set question
  as a `<select multiple>` rather than silently offering one value
  where a set was asked for.

- **The composed-entrypoint e2e grid — 21 cells that build for real.**
  The stacks pairing `arch.cli` with `arch.server-http` had no
  end-to-end coverage at all: every claim about a two-entrypoint
  hexagon was asserted at the domain-test level, and no real
  `gradle`/`mvn`/`npm`/`pnpm` build had ever compiled one under either
  module layout. `tests/e2e/combo-<layout>-<stack>-<build>.test.ts` is
  one file per cell, so "every cell has a suite" is checkable from
  `ls`.
  - **The `modulith` half is exhausted** — 6 JVM combo stacks × Gradle
    and Maven, plus `ts-cli-http` × npm and pnpm. That is the half
    issue #108 is about: `jvm-shared-root-modulith.ts` and
    `ts-shared-root.ts`'s modulith branch had shipped without a build
    ever touching them.
  - **The `basic` half is sampled** at one build per stack (7 cells),
    the build system alternating so both appear against each framework
    and each language, and the TypeScript sample taking pnpm — the
    package manager whose isolated store refuses an undeclared
    dependency npm's hoisting would hide.
  - **Every cell ends in a runtime entrypoint check**, not a green
    compile: the CLI assembly's jar (or `main.ts`) greets on stdout,
    and the REST assembly's boots and answers the whole `/greet` wire
    contract — the same two drive steps the single-entrypoint cells
    use, lifted into `tests/support/jvm-combo-e2e.ts` and
    `ts-combo-e2e.ts` so 21 cells cannot drift into 21 slightly
    different assertions. Each also asserts the root build file
    registers every module _exactly once_, which is the regression the
    shared-root upsert exists to prevent.
  - **Six new CI shards** (`jvm-combo-<framework>-<language>`), three
    files each, following the `jvm-modulith-*` convention rather than
    the job-per-cell one — see `AGENTS.md` §9 for why the two grids
    differ. The TypeScript cells ride a `web-combo` shard of their own.

- **`keel ui` — the local scaffolder.** A Spring-Initializr-shaped
  front end for the engine the CLI already drives, served on loopback
  and stopped with Ctrl-C. Point it at an empty directory and it is
  `keel new`; point it at a keel project and it becomes `keel add` /
  `keel add module`, offering only what that project can take. What it
  adds over the CLI is the **plan while the choices are still moving**:
  the file tree redraws on every change, before anything is written.
  Nothing is uploaded — the server is your own `keel` install and the
  deferred actions run on your machine. See
  [`docs/ui.md`](docs/ui.md).
  - **A second primary adapter, not a second engine**
    (`src/application/web/`). `contract/` maps a request to a command
    or query from `domain/contract` and a `Result` back to a response
    — the same rule the CLI adapter lives under, enforced by
    dependency-cruiser; `executable/` owns the socket, the token and
    the asset roots. The two primary adapters never import each other,
    bar the types-only `ServeUi` the CLI needs to inject `keel ui`.
  - **Three new queries make the form possible**
    (`domain/contract/queries.ts`). `keel.catalog` reports every stack
    and vertical with its dials — including whether
    `--with-peer-context` buys anything, probed against the adapter set
    rather than listed. `keel.project-status` reports what a directory
    already holds, mirroring the refusals the brownfield handlers would
    issue so a control can be absent instead of an error. `keel.preview`
    runs a real install as a dry run and reports both halves of it: the
    questions it asked and the plan it produced.
  - **The question set is discovered, not enumerated.** An adapter is
    asked only once its predicate matched, and a predicate reads tags
    an earlier answer folded in, so there is no static form to render.
    `keel.preview` runs the real engine with a prompt that answers
    instead of blocking and records as it goes — which is why the form
    can never offer a question the install does not ask, or hide one it
    does.
  - **The page is framework-free custom elements on
    `@rgoussu.dev/planks`** (`assets/web/`), the same design system
    keel emits for its `web-components` stack, served as ESM with no
    bundler. It is linted like the rest of the source: `pnpm lint` now
    covers `assets/web` alongside `src` and `tests`.
  - **The loopback port is guarded three ways**, because it is
    reachable by every page in the user's browser: a per-run token in a
    custom header (which also forces a preflight this server answers
    for nobody), a `Host` allowlist against DNS rebinding, and an
    `Origin` allowlist. No CORS header is ever sent.
  - **The `keel new` wizard's review step is flow control, and now says
    so.** `WizardPrompt.askDirect` marks its proceed/edit/cancel
    question with the `control` asker, so a prompt that collects
    answers instead of blocking can tell a question about the plan from
    a question about what to do next. `keel.preview` takes its default
    (ending the staging loop at the first plan) and keeps it out of the
    reported question set, where it would otherwise arrive at a form as
    a field. A preview also narrates through no logger at all — the
    wizard prints its whole staged plan before reviewing, which under
    `keel ui` is hundreds of lines per keystroke to a terminal nobody
    is reading.
- **`keel new`'s interactive flow is now a guided wizard, not a bare
  question queue.** The stack itself is the first question asked —
  `keel new` bare or `--stack` omitted no longer silently defaults to
  `quarkus-cli` when interactive. `--with-peer-context` is now offered
  interactively the moment `--module-layout` resolves to `modulith` on
  a stack whose modulith actually has a peer context, instead of being
  flag-only. Every question order stays flag-suppressible: supplying a
  flag on the command line always skips its question, and `--yes`
  stays fully non-interactive with no prompts at all. After every
  question resolves, a review step shows the full plan (the same
  file/action list `--dry-run` prints) and lets you proceed, cancel
  (`keel.cancelled`, nothing written), or jump back to any answered
  question and re-answer it — everything asked after that question is
  re-resolved, since a later choice may cascade (a different stack or
  build system can change which adapters run at all). Implemented as a
  `WizardPrompt` layered over the existing `Prompt` port in
  `domain/core` rather than growing the port itself, so the interactive
  adapter and its fakes stay unchanged in shape.

- **Composable entrypoints — `arch.cli` + `arch.server-http` on one
  hexagon.** Go and Rust already shipped both a CLI and an HTTP
  deployment unit on the same tag set; the JVM and TypeScript stacks
  now do too, via nine new stack presets: `quarkus-cli-rest`,
  `quarkus-cli-rest-kotlin`, `spring-cli-rest`,
  `spring-cli-rest-kotlin`, `micronaut-cli-rest`,
  `micronaut-cli-rest-kotlin`, `go-cli-http`, `rust-cli-http`,
  `ts-cli-http`. One shared domain, both deployment units — the shared
  root files (`settings.gradle.kts`/`pom.xml`, `build.gradle.kts`,
  `gradle.properties`, root `package.json`, `README.md`) upsert
  instead of each entrypoint writing its own whole-file copy
  (`jvm-shared-root.ts`, `ts-shared-root.ts` — the same "shared-file
  upsert" pattern `go-cli-bootstrap` already used for its README
  section). Works under **both** module layouts: under
  `--module-layout=modulith` an entrypoint contributes a driving
  adapter _inside_ the bounded context (`user-side/cli`,
  `user-side/api/…`) as well as its own assembly, and the seeded root
  files carry both (`jvm-shared-root-modulith.ts`).
  - The JVM domain templates (`jvm-domain/java`, `jvm-domain/kotlin`,
    and their `jvm-domain-modulith` twins) unify on the richer REST
    shape (the `GreetRejected` validation path), so the CLI
    entrypoint of every combo — and of every existing `*-cli` stack —
    now demonstrates the same domain-error mapping the REST
    entrypoint always did. The modulith's four per-arch domain trees
    (`java-cli`, `java-rest`, `kotlin-cli`, `kotlin-rest`) collapse
    into two per-language ones.
  - `--with-peer-context` and `keel add module <name>` wire the new
    bounded context into **every** assembly the project has rather
    than the first one an `arch.*` check matched, so a composed
    CLI + HTTP modulith gets both wired (`jvmAssemblies`, the JVM
    sibling of `tsAssemblies`).
  - The TypeScript root `package.json` now names each entrypoint's
    scripts explicitly rather than a bare `start`/`dev` —
    `start:cli`, `start:rest`, `dev:rest` — on every `ts-cli`,
    `ts-http`, and `ts-cli-http` scaffold, under either module
    layout, so the same names work whichever stack (or both) you
    picked. The emitted claude-kit runbook and the fullstack product
    README follow the rename (`dev:rest`, not `dev`).
  - The two bootstraps of a composed stack now share one project
    identity: `Adapter.sharesAnswersWith` names the sibling whose
    recorded answers count as an adapter's sticky memory, so
    `basePackage`/`projectName` (JVM) and `npmScope`/`projectName`
    (TypeScript) are asked once and recorded under both ids. Sticky
    memory is keyed per adapter, and two answers that disagree leave
    a Maven reactor whose modules parent an artifactId the root does
    not have, or a workspace whose assembly depends on a scope the
    context does not publish.
- **`keel new --list` / `keel add --list`.** Prints every stack (or
  vertical) id with its one-line description, then exits — nothing is
  scaffolded. `keel add --list` needs no existing project.

- **`code-style` — the layout contract, wired so nobody configures
  it.** A new vertical installed by every stack (and addable with
  `keel add code-style`), closing a gap where scaffolded projects
  shipped no style configuration, no format or lint CI step and no
  editor settings — while the binding spec keel emits into them
  claimed every commit passes "format, typecheck, lint".

  The design turns on one fact: there is no runtime "one config to
  rule them all". `.editorconfig` reaches the actual formatter in only
  two of the five families keel emits — Kotlin, where ktlint treats it
  as its _primary_ configuration, and the web family, where Prettier
  reads a subset natively. Java's mainstream formatters, `gofmt` and
  `rustfmt` all ignore it. So keel holds **one style model** and fans
  it out at generation time into every dialect, giving the scaffolded
  project a real single source of truth with no extra runtime
  dependency and no added CI time — no `treefmt`, no `dprint`, no
  meta-formatter.
  - `editor-baseline` (universal): `.editorconfig` + `.gitattributes`,
    per-language and **honest** — Go gets hard tabs and no
    `max_line_length`, because that is exactly what `gofmt` enforces.
  - `formatter` (per family): Spotless on the JVM with
    **prince-of-space** for Java and **ktlint** for Kotlin,
    `rustfmt.toml` for Rust, Prettier for both TypeScript stacks and
    the SPA, and nothing at all for Go.

  prince-of-space is what makes it cohere: the only Java formatter
  with configurable indent and width, so Java's config is a co-render
  of the same numbers rather than an unconfigurable verdict. Kotlin
  follows `.editorconfig` **live**; Java, Go and Rust are co-renders —
  an asymmetry the emitted file states in its own header.

  Go and Rust cost the project nothing: both formatters ship with the
  toolchain it already requires.

- **A format check in every emitted pipeline**, on both the GitHub and
  GitLab flavors of all four pipeline adapters, keyed on the
  `style.managed` tag so a project without the vertical gets no format
  step rather than one calling a command its build cannot answer.

- **`code-style`'s third dimension: `linter`** — naming case, wildcard
  imports, and doc comments on public API, the free-tier slice of
  static analysis this vertical always meant to grow into. Closes the
  gap where the binding spec promises a `/docs-check` audit
  (`assets/project/AGENTS.md` §8) that no command in the repository
  actually performed.
  - Free, no new dependency: Rust gets all three legs
    (`cargo clippy --workspace --all-targets -- -D warnings -D missing_docs -D clippy::wildcard_imports`,
    verified against real clippy — `wildcard_imports` and
    `missing_docs` are both allow-by-default and need the explicit
    `-D`), Go gets `go vet ./...`. The JVM family's wildcard-import
    check rides inside the existing Spotless block —
    `forbidWildcardImports()` for Java, parity with Kotlin's
    already-shipping ktlint default — rather than a command of its
    own, so `code-style/jvm-lint` exists only to satisfy dimension
    coverage.
  - The one family with no zero-dependency subset of this scope:
    TypeScript has no wildcard-import syntax, and naming case plus doc
    comments both need a rule engine. ESLint 10.8.1 +
    `typescript-eslint` 8.67.0 (`naming-convention`) +
    eslint-plugin-jsdoc 64.2.1 (`publicOnly: true`) ship for the web
    family, run as `<pm> exec eslint .` rather than a `package.json`
    script so the existing `"lint"` (depcruise, on the modulith
    layouts) is never shadowed.
  - **CI-only, no hook**, unlike the formatter: most findings cannot
    be auto-fixed, and the one kind that can (`eslint --fix`,
    `clippy --fix`) risks reflowing `.ejs`-templated or
    regex-anchored source `keel add module` expects verbatim later.
    `ciLintCheck` gates every emitted pipeline (both providers, all
    four families) on the `style.lint-managed` tag, mirroring the
    format gate exactly.
  - Checkstyle, detekt and golangci-lint's `revive`/`exported` rule —
    the naming-case and doc-comment legs for Go and the JVM — are a
    separately-argued follow-up, not shipped here (roadmap item O).

- **Single-source pins: the dev container and CI converge on the
  toolchain needs (roadmap N.5).** The `toolchain` block, the
  `dev-container` features and the `ci` setup steps each used to
  state their own JDK / Node / Go version, kept honest only by the
  pin registry's sweep happening to claim all three occurrences. They
  now resolve through one shared pin source
  (`src/domain/core/adapters/version-pins.ts`), whose
  `TOOLCHAIN_PIN_SOURCE` names the `version-pins.json` entry each
  tool's version comes from: **one registry edit moves all three**,
  and a devcontainer can no longer provision a JDK the project does
  not declare a need for. The emitted CI templates render their
  versions instead of literalizing them (`java-version`,
  `eclipse-temurin:<jdk>-jdk`, `node-version`, `node:<node>`,
  `golang:<go>`), and the Go dev container asks for the pinned minor
  rather than `latest`, so the editor and `go.mod` agree. A new guard,
  `tests/toolchain-pins.test.ts`, runs in `verify` — it scaffolds
  every family, reads the versions back out of the emitted
  `devcontainer.json`, `ci.yml` and `.gitlab-ci.yml`, and fails when
  any of them departs from the recorded needs; it also pins down the
  surfaces that deliberately state no version (GitHub's
  `go-version-file`, `rustup update stable`, corepack's
  `packageManager`), so one quietly growing a literal is equally red.
  Emitting `keel toolchain install` into pipelines is deliberately
  **not** part of this: the provider setup actions are faster and
  cached, and the convergence is about the values, not the mechanism.
  Documented in `docs/verticals/dev-container.md`,
  `docs/verticals/ci.md` and `docs/development.md` → Version currency.
- **Prefixes resolve through the manager before the render (roadmap
  N.6).** The block pins a _major_ for the JDK and for Node — a
  series, not a release — and two provider records cannot take one:
  asdf documents `.tool-versions` as a lockfile that wants exact
  versions and forbids `latest`, and SDKMAN!'s candidate identifiers
  always carry a patch, so `java=25-tem` names nothing installable.
  Both now declare a resolution, and `keel toolchain install|check`
  runs it before anything is rendered. The order is **lockfile
  order**: whatever the config already names wins while it still
  answers the prefix, and only when nothing answers is the manager
  asked its own way (`asdf latest java temurin-25`, `sdk list java`).
  Asking first would have been the obvious design and the wrong one —
  every `check` would re-query upstream and call a perfectly good
  lockfile stale the day a patch shipped. So a resolved file stays
  put, a re-run writes nothing, the steady state costs no process at
  all, and an absent manager can no longer overwrite a good file with
  the prefix it came from. `.tool-versions` now carries
  `java temurin-25.0.4+7` where the block says `jdk 25`, and
  `.sdkmanrc` `java=25.0.4-tem`. keel never invents the patch half:
  where neither the file nor the manager can name a version, the
  prefix renders as it always did — the declaration still lands — and
  both reports carry it as `unresolved`, which `check` counts against
  `satisfied` and the CLI prints as a warning naming the tool.

- **sdkman, rustup, and Go's native no-op — the launch provider set
  is complete (roadmap N.4).** Three records join the manager dial,
  and none of them widens it: each is offered only where its
  ecosystem is the _whole_ declaration, which is the coverage
  invariant doing the work rather than a rule of their own. **sdkman**
  renders `.sdkmanrc` (`java=25.0.4-tem`, `gradle=9.4.1`) and installs
  with `sdk env install`, reached through a login shell that sources
  `sdkman-init.sh` because `sdk` is a shell function rather than a
  binary — so it appears on JVM-only projects and is silently absent
  the moment one also declares Node or Go. **rustup** renders
  `rust-toolchain.toml`, the file cargo honors natively with no
  activation story at all, and installs with
  `rustup toolchain install`; because the scaffolds track latest
  stable by construction the block pins a bare Rust major, which
  rustup — having no "series" channel — spells `channel = "stable"`.
  **go-native** is the explicit "no manager needed" answer: since Go
  1.21 the `toolchain` directive in `go.mod` makes any installed Go
  auto-provision the pinned one, so keel merges that directive in
  place (the corepack situation — the file belongs to the project)
  and runs no command at all. That merge is the choice's consistency
  check: `keel toolchain check` reports `go.mod` out of date the
  moment its directive and the recorded need disagree, and
  `keel toolchain install` writes it back. The directive is a
  **floor**, not a pin, so a newer local Go is used as is. Choice
  lists per profile are now `mise · asdf · sdkman` on the JVM,
  `mise · asdf · rustup` on Rust, `mise · asdf · go-native` on Go,
  and the Node ones unchanged; on a fullstack composite each service
  answers its own dial, so "sdkman for the backend, nvm for the
  frontend" falls out as two per-service answers with nothing new
  behind it. The two new keel-chosen spellings
  (`sdkman-java-distribution`, `rustup-stable-channel`) join
  `assets/composition/version-pins.json`.
- **The manager dial — coverage resolution, singles vs combinations
  (roadmap N.3).** The version manager `keel toolchain install`
  provisions with is now a **choice**, and the choice list is
  computed from the project's declared needs rather than declared
  anywhere: a provider whose coverage contains the whole needs set is
  offered as a single, and where none does, a curated **combination**
  is offered for the same coverage. A partial choice is never offered
  — the "no half-installs" rule applied to choices (the _coverage
  invariant_), which a unit test now asserts directly against the
  real family profiles. Three new provider records join mise: **asdf**
  (`.tool-versions`, plugin-named tools, `asdf plugin add` +
  `asdf install`), **nvm** (`.nvmrc`, reached through a login shell
  because nvm is a shell function; covers `node` and the `npm` that
  ships with it) and **corepack** (the `packageManager` field in the
  project's own `package.json`, merged in place; covers `pnpm`). So a
  JVM project is offered `mise · asdf`, an npm-tagged TypeScript one
  `mise · asdf · nvm`, and a pnpm-tagged one
  `mise · asdf · nvm+corepack` — the same provider as a single on one
  profile and inside a combination on another is the invariant
  working as intended. **Combinations are compositions, not new
  records**: a combination lists member ids, renders each member's
  native file, runs each member's install in curated order, and costs
  nothing beyond the records it reuses; it is all-or-nothing, since
  running half of one is the half-install the invariant prevents. The
  answer is **sticky** — recorded in the toolchain block's new
  `provider` field, one field even for a combination, written by the
  engine so `keel add toolchain --reapply` refreshes versions and
  leaves the choice alone — and re-validated against the needs on
  every run, so a project that grew a pnpm need after choosing nvm
  gets a loud re-choice rather than a half-install. `keel toolchain
install` gains `--yes` (take the default, mise) and
  `--provider <id>`; `keel toolchain check` reads the recorded choice
  and never asks or records one of its own. Reports now carry one
  entry per rendered config and name the member satisfying each need.
  The registry gains `asdf-java-distribution` and `nvm-installer`,
  both currency-covered. Documented in `docs/cli.md` → the manager
  dial, `docs/composition.md`, and `docs/verticals/toolchain.md`.
- **`keel toolchain install` / `keel toolchain check` — the
  provisioning engine, mise walking skeleton (roadmap N.2).** A new
  bounded context inside keel (`src/domain/toolchain/`, its own
  hexagon) reads the `toolchain` block and satisfies it through
  exactly one provider — [mise](https://mise.jdx.dev) — end to end.
  `install` renders the block as `mise.toml`, the provider's
  _native_ file (`jdk@25` is spelled `java = "temurin-25"`, every
  other tool verbatim), then runs `mise trust` + `mise install` —
  idempotent at any point in the project's life: new laptop,
  teammate clone, CI runner, pin bump. mise absent → the config is
  still rendered and the command reports loudly with the bootstrap
  one-liner and the manual tool list, never a silent skip. `check`
  reports satisfied/missing per need — counting `mise.toml` drift
  against the block as unsatisfied — without touching anything, and
  exits 1 when unsatisfied. The engine is an **orchestrator, never
  an installer**, and meets the rest of keel only at
  `domain/contract` (the block schema and the shared ports) — the
  seam is enforced both ways by new dependency-cruiser rules, per
  the "modulith first, extraction later" decision. The provider
  record model (id, covers, config renderer, install sequence,
  per-tool version spelling) is the surface N.3's manager dial and
  N.4's further providers build on; the mise JDK-distribution
  spelling registers in `assets/composition/version-pins.json`
  (`mise-java-distribution`), whose sweep now also scans the new
  context. Fake-driven engine tests run in `verify`; a **real**
  `mise install` suite (`tests/toolchain/`) is opt-in via
  `KEEL_RUN_TOOLCHAIN=1` — the `tests/currency/` pattern, never in
  the PR matrix. Documented in `docs/cli.md` → `keel toolchain`,
  `docs/verticals/toolchain.md`, and `docs/development.md`.
- **`toolchain` vertical — the writer of the `toolchain` manifest
  block (roadmap N.1).** `keel add toolchain` derives the project's
  toolchain **needs** from the manifest's tags — one
  predicate-selected adapter per family, the `dev-container`
  pattern: `runtime.jvm` → `jdk` + the build system the `pkg.*` tag
  names, `lang.go` → `go`, `lang.rust` → `rust`, `lang.typescript` →
  `node` + `pnpm` when tagged (npm rides with Node) — and records
  them in the N.0 block, plus a short "Toolchain" runbook note in
  the README. Versions are read from
  `assets/composition/version-pins.json` at install time (each need
  cites its entry id as `source`), so the block is one more consumer
  of the registry, never a second place versions are stated; the
  registry gains a `ts-pnpm` entry claiming the `packageManager`
  pins the TS/web templates already carried.
  `keel add toolchain --reapply` refreshes the block after a pin
  bump — needs upsert by tool, so nothing duplicates. Deliberately
  opt-in (no stack installs it by default) until the provisioning
  engine (N.2+) settles the end-to-end story; on a fullstack
  composite each service records its own block via its own manifest.
  Documented in `docs/verticals/toolchain.md`.
- **The versioned `toolchain` manifest block (roadmap N.0).** The
  manifest may now carry a `toolchain` block — the project's declared
  toolchain needs (`{ tool, version, source? }` over a closed tool
  vocabulary: `jdk`, `gradle`, `maven`, `go`, `node`, `npm`, `pnpm`,
  `rust`), versioned independently of the manifest via its own
  `schemaVersion` since it is destined for an external consumer once
  the provisioning engine extracts. Schema + types in
  `domain/contract/toolchain.ts`; the block is optional and absence
  ("nothing declared") is distinct from an empty needs list. This
  slice is the contract only — no writer, no consumer; the
  `toolchain` vertical (N.1) and `keel toolchain install` (N.2)
  build on it. Documented in `docs/composition.md` → "The toolchain
  block".
- **`iac` vertical — the OpenTofu deploy target the release pipeline
  publishes to.** `keel add iac` closes the loop the `distribution`
  vertical opens: keyed on the `dist.container-image` tag, it
  provisions the registry-consuming runtime matching the **recorded**
  deployment flavor — read from the manifest, never re-asked —
  `compose` → a Docker VM (engine cloud-init-installed, firewall for
  SSH + the service port, deploys over `DOCKER_HOST=ssh://…`),
  `helm` → a managed Kubernetes cluster (latest stable by data
  source, default node pool). The cloud is a sticky dial with one
  template subtree per choice: DigitalOcean (default — droplet /
  DOKS, state in Spaces) or Scaleway (instance / Kapsule with its
  required Private Network, state in Object Storage); the choice is
  promoted as a `cloud.*` tag beside `iac.opentofu`. The emitted
  tree follows binding spec §5: root `iac/<cloud>/`, remote state by
  default with a one-shot `bootstrap.sh` provisioning the state
  bucket from a local-state bootstrap config, one state per
  environment via workspaces, and no credential in any file —
  provider auth rides the environment, 12-factor.

- **Per-service build systems in composite stacks**
  ([#73](https://github.com/rgoussu-dev/keel/issues/73)). The
  `fullstack*` composites now offer each service's build-system
  choice instead of pinning every service to its stack's default:
  interactive installs ask per service (`Build system for backend
(quarkus-rest)`), and `--build-system` takes per-service `path=id`
  pairs, comma-separated — `keel new --stack=fullstack --build-system
backend=maven,frontend=pnpm`. The chosen id is recorded on the
  product manifest's service refs, and the monorepo glue follows it:
  the compose Dockerfiles build with the recorded tool (Maven builder
  stage + `target/` artifact paths via the shared `jvmRestArtifact`
  derivation; corepack-provisioned pnpm installs on the Node images)
  and the product README's run hints match. Each service's own
  manifest carries the corresponding `pkg.*` tag, so `keel add
ci`/`containerization`/`distribution` on a service follow the same
  choice, as they already did on standalone stacks.

- **`keel add <vertical> --reapply` — the update path for scaffolded
  projects.** Re-renders an already-installed vertical from the
  answers the manifest recorded, so a template fix in keel becomes
  deliverable to existing projects. Conservative by design:
  template-owned files are rewritten to the pristine re-render, each
  rewrite reported as a unified diff against the working tree
  (byte-identical renders are skipped; `--dry-run` shows the diff
  without writing), while a patch that would change an already-patched
  shared file refuses the whole run with `keel.reapply-conflict`
  before anything is committed — with no recorded base, a changed
  patch result cannot be told apart from a double application.
  Recorded answers are frozen (`--set` with `--reapply` errors with
  `keel.reapply-frozen-answers`; a question added to the vertical
  since the install resolves to its default), re-promoted tags never
  double, and the vertical keeps its original `installedAt`.
  Reapplying a vertical that is not installed errors with
  `keel.vertical-not-installed`, and the `keel.vertical-already-installed`
  message now points at `--reapply`.

- **Build-from-sources loop — exercise keel locally the way a user
  consumes it.** `pnpm keel …` builds and runs the CLI from `dist/`
  inside a scratch playground directory (`KEEL_PLAYGROUND` pins it
  across invocations, so `keel add` flows work; a playground inside
  the repo is refused), and `docs/development.md` → "Trying keel
  locally" documents both that fast inner loop and the
  packaging-fidelity loop — `pnpm build && npm pack`, install the
  tarball into a scratch prefix, `keel new` from there — which is
  what proves bin wiring, the `files` list, and that template assets
  actually ship in what npm publishes.

- **The Claude kit — stack runbook addenda + emitted `.claude/`
  content on every scaffold.** The walking skeleton gains an
  `agentic-kit` dimension covered by one adapter per stack family
  (`jvm-claude-kit`, `go-claude-kit`, `rust-claude-kit`,
  `ts-claude-kit`, `wc-claude-kit`), each resolving its commands from
  the manifest tags (build system, framework, entrypoint shape,
  module layout) rather than minting adapters per `pkg.*` tag. Every
  scaffold now ships: a **stack runbook** appended to the emitted
  `AGENTS.md` under sentinel markers
  (`<!-- keel:stack-runbook:begin/end -->` — the section replaces
  itself on re-apply and never touches the user's edits around it),
  the **pre-commit format hook** keel itself uses
  (`.claude/hooks/pre-commit-format.sh`, wired via
  `.claude/settings.json`; auto-formats with `gofmt`/`cargo fmt`
  where the toolchain ships a formatter, then runs the family's CI
  gate so every commit lands green), and a **`run` skill**
  (`.claude/skills/run/SKILL.md`) with the launch-and-probe loop for
  the scaffolded shape. Closes the roadmap-G half of the "universal
  Claude Code workflow kit" identity.

- **`ts-cli` stack — the CLI twin of `ts-http`, completing the
  family's CLI/HTTP pairing** ([#71](https://github.com/rgoussu-dev/keel/issues/71)).
  `keel new --stack=ts-cli` scaffolds the same no-build-step
  TypeScript workspace (Node 22.18+ runs the sources directly, the
  `exports` maps hold the walls) with the deployment unit swapped:
  `application/cli` maps flags to commands and `Result`s to streams +
  exit code — 0 for a greeting, 2 when the domain says no, 1 for a
  defect. Both module layouts and both package managers from day one;
  the entrypoint-neutral half of the bootstrap now lives in a shared
  `walking-skeleton/ts-domain` template tree both stacks render.
  `--with-peer-context` and `keel add module` became
  entrypoint-agnostic on TypeScript (`tsAssemblies`, the Rust/Go
  pattern), so the modulith story carries over whole. Two new e2e
  cells (`modulith-ts-cli-{npm,pnpm}`) and a basic walking-skeleton
  suite ride the `web` shard.

- **`persistence` — a second RDBMS engine behind the sticky `engine`
  dial: MariaDB on the JVM stacks.** The dial in
  `persistence-engine.ts` now carries everything an engine varies —
  driver coordinates, Quarkus `db-kind`, the Flyway database module,
  the Testcontainers module + container class, the dev-compose
  container (env, healthcheck, data dir), the JDBC time mapping and
  the schema dialect — so the six JVM HTTP stacks (Quarkus/Spring/
  Micronaut × Java/Kotlin, Gradle or Maven, both module layouts)
  scaffold against `--set 'persistence/database-compose:engine=mariadb'`
  with no adapter forked. The emitted contract test and the
  Testcontainers image follow the chosen engine on every stack. The
  Go/Rust/TS drivers speak the PostgreSQL wire protocol, so a
  non-postgres engine there fails loudly at install before anything
  is written.

- **`persistence` — Liquibase (YAML) as an alternative to the Flyway
  migrations unit, behind the second sticky dial (`migrations`).**
  The same plain SQL under `migrations/sql/` (now the shared
  `migrations-sql` template tree) is wrapped by a YAML changelog via
  `sqlFile` and baked into the official Liquibase image, configured
  through `LIQUIBASE_COMMAND_*` env vars, with the dev-compose
  one-shot following. Served on Go/Rust/TS, whose emitted replay
  paths are tool-agnostic; the JVM stacks' `%dev`/`%test` replay is
  Flyway-wired today, so `migrations=liquibase` there fails loudly —
  wiring the frameworks' Liquibase integrations is a roadmap item.

- **Version-currency loop for the emitted templates' pins**
  ([#75](https://github.com/rgoussu-dev/keel/issues/75)). The
  templates pin framework and tool versions that rot silently against
  the binding spec's "always latest stable"; now
  `assets/composition/version-pins.json` registers every such pin —
  BOMs, wrappers, toolchain majors, image tags, emitted-workflow
  action refs, across `assets/composition/` and the adapter sources
  that embed template content — with its locations and its upstream
  latest-stable feed. An offline guard (`tests/version-pins.test.ts`,
  in `verify`) keeps registry and templates in lockstep and fails on
  any pin-shaped string no entry claims; the weekly
  `version-currency` workflow runs the opt-in drift report
  (`tests/currency/`, `KEEL_RUN_CURRENCY=1`), where a failing test
  names the pin, the pinned value, and the current latest stable.
  Deliberately a schedule, never a PR gate; bumping stays a
  human-reviewed change proved by the e2e grid.

- **`dev-container` vertical — a Dev Container definition on every
  stack, attached to the dev environment when one is installed.**
  Every non-composite stack (and thus every composite service) now
  scaffolds `.devcontainer/devcontainer.json` by default, with the
  stack's toolchain provisioned as Dev Container features — JDK 25 +
  the manifest's build system on the twelve JVM stacks
  (`jvm-devcontainer`), latest stable Go (`go-devcontainer`) and
  Rust (`rust-devcontainer`), Node 22 + a dependency-installing
  `postCreateCommand` with the tagged package manager on the
  TypeScript stacks (`node-devcontainer`). Also brownfield:
  `keel add dev-container`.

  When the `dev-env` vertical is on the manifest, the definition is
  **Compose-based and joins the dev environment's own Compose
  project**: `devcontainer.json` lists `../dev/compose.yaml` plus a
  `.devcontainer/compose.yaml` overlay declaring the `workspace`
  service, so the workspace shares the dev env's network, reaches
  its services by name, and attaches to a dev env already running on
  the host instead of restarting it — with
  `docker-outside-of-docker` provisioned so the dev env can be
  driven from inside. Without `dev-env`, the definition is
  image-based on the devcontainers Ubuntu base — and install order
  does not matter brownfield: `keel add dev-env` after the fact
  upgrades a standalone definition to the attached shape (refusing,
  with the manual recipe, if the definition was customized away from
  the scaffolded shape rather than silently rewriting it).

- **`distribution` for the server-shaped stacks — CI-built images on
  tag push, plus a deployment descriptor.** `keel add distribution`
  used to hard-fail on anything but a Gradle Quarkus CLI; now a
  container family covers the same `build` / `release-channel`
  dimensions for every server shape, one adapter per stack family:
  `jvm-container` (all twelve JVM stacks — build system read from
  the manifest, and the JVM-vs-native flavor read from the dial
  `containerization` recorded rather than re-asked), `go-container`,
  `rust-container`, `ts-container` (no host build at all — the image
  installs the sources) and `wc-container` (the SPA's assets image).
  `quarkus-cli-native` is untouched for CLIs.

  The release pipeline **builds the Dockerfile the `containerization`
  vertical emitted** — one image definition, no second build system —
  and requires it, refusing with the fix in the message when the
  Dockerfile is missing. The provider is the `ci` vertical's own
  sticky dial, reused: GHCR under `github-actions` (a
  `release-image.yml` workflow pushing with `GITHUB_TOKEN`), the
  GitLab Container Registry under `gitlab-ci` (release jobs appended
  to `.gitlab-ci.yml`, gated on `v*` tags) — and when `ci` already
  recorded its choice as a tag, that answer wins silently.

  The **deployment flavor is a second sticky dial** — `compose`
  (default) emits a production `deploy/compose.yaml`, `helm` a
  minimal `deploy/chart/` — each one template subtree, like the ci
  provider. 12-factor is binding: one image serves every environment,
  descriptors carry config exclusively via environment
  (`${VAR:-default}` passthroughs, `values.yaml → env`), and only
  variables the scaffolded service actually reads appear (`DB_URL` &
  friends when persistence is installed, `OTEL_*` when observability
  is). The SPA descriptor deploys the assets image as a real init
  container — compose gates nginx on
  `service_completed_successfully`, the chart uses `initContainers`
  over an `emptyDir` — with the API base URL injected at deploy time.
  Docker Swarm is deliberately not a flavor; the roadmap records why.
  Every container adapter promotes `dist.container-image`.

- **Deploy-time runtime config for the SPA.** The `gateway` vertical
  now emits `public/env.js` (`window.__ENV__`, dev default
  `API_BASE_URL: '/api'`), loads it from `index.html` before the
  bundle, and the assembly reads it ahead of the Vite-baked
  `VITE_API_BASE_URL`. At deploy time the assets image's entrypoint
  rewrites `env.js` in the served volume from the environment, so
  one bundle serves every environment — a rebuild per environment
  would be a 12-factor violation, and now nothing asks for one.

- **The `ci` vertical — the pipeline every push has to pass.**
  `keel add ci` puts a build-and-test pipeline on push on every stack
  keel emits, for the CI provider you pick — GitHub Actions at
  `.github/workflows/ci.yml`, or GitLab CI at `.gitlab-ci.yml` — so
  the binding spec's "done means green gates" finally has scaffold
  backing, where projects used to leave `keel new` with no pipeline
  at all.

  One adapter per stack family covers the single `pipeline`
  dimension, and the build system is read from the manifest tags
  rather than minted as more adapters — the pattern
  `containerization` established. The **provider is one sticky
  question** (`github-actions` default, `gitlab-ci` the alternative),
  asked once, for the same reason the image flavor is a question:
  nothing in the tag set knows where the repository is hosted. Each
  flavor promotes its own tag, `ci.github-actions` or `ci.gitlab-ci`.

  `jvm-pipeline` provisions JDK 25 and runs `./gradlew build` or
  `./mvnw verify` per the recorded `pkg.*` tag; `go-pipeline` pins
  the toolchain to the project's own `go.mod` (`go-version-file` on
  GitHub, the Go toolchain mechanism past the `golang` image on
  GitLab); `rust-pipeline` builds and tests `--workspace` on latest
  stable; `ts-pipeline` serves both TypeScript stacks — `npm ci` or
  corepack-provisioned `pnpm install --frozen-lockfile`, then
  typecheck, lint and build `--if-present`, test — with the
  dependency cache expressed per provider (`setup-*` action caches
  against explicit `cache:` paths).

  The pipeline trusts the project's own build — it provisions a
  toolchain and invokes the wrapper or package manager the scaffold
  shipped, never duplicating build configuration — and it triggers on
  `push` alone, because the emitted binding spec (§6) mandates
  trunk-based development with no PRs (no `pull_request` trigger, no
  merge-request pipeline). Nothing moves with the module layout: one
  pipeline per provider serves `basic` and `modulith` unchanged.

- **`keel add module <name>` — a second bounded context by command,
  not by flag.** `keel new --with-peer-context` grows a modulith
  exactly once, at scaffold time. This grows it whenever, by name, on
  every stack family that ships a modulith: the twelve JVM stacks, Go,
  Rust, `ts-http` and `web-components`.

  What lands is a **structural shell** in the layout the stack already
  uses — a contract face, a core with one handler, and a
  `user-side/service` seam of its own — plus, under
  `--consumes <other>`, a driven port `<Other>Client` and an
  `<Other>Gateway` over that context's seam. All of the vocabulary
  derives from names keel actually holds: `<Name>Command` /
  `<Name>Result` for the placeholder use case, which carries a doc
  comment saying that renaming it is the first thing to do.

  **An added context always publishes a seam, and the peer context
  never does.** That asymmetry is the load-bearing decision. The
  `--with-peer-context` context is a pure consumer — verified in all
  five families: contract face, core, gateway, and no
  `user-side/service` — because nothing in the emitted project
  consumes _it_. A context you add is different: the obvious second
  command is `keel add module shipping --consumes ordering`, and that
  needs `ordering` to have published a seam when it was added. So the
  manifest records `seam` per context, and `--consumes guestbook`
  names a real context and an impossible target.

  **The seam is spelled like the skeleton's, with the new context's
  name in it** — `OrderingService.orderingFor` against
  `GreetingService.greetingFor`, `ordering_for` against
  `greeting_for`. One gateway template therefore reaches _any_
  context, keel's own skeleton included, with no table of per-context
  seam spellings to go stale.

  **Three contexts is the shape that finds bugs, and everything here
  was built against it.** The skeleton's seam self-assembles — its
  core takes no dependencies — and no added context's can, because an
  added context's core may itself hold a gateway to a third. So a
  consumer constructs the skeleton's seam directly and reaches an
  added context through _that context's own wiring function_. With two
  contexts the consumed one is always the skeleton and that branch is
  unreachable. Every family's e2e now builds three.

  Per-family notes, because the walls differ:
  - **JVM** — four modules per context against the peer's three, six
    (framework, language) bindings, both build systems. Each context
    binds in a `<Name>Wiring` class of its own rather than as more
    producer methods on the shared composition root: two contexts
    reaching the same third one each declare a `<Consumes>Client`, and
    one Java import block cannot name two types of that simple name.
    Every list a container reads — Spring's `@ComponentScan`,
    Micronaut Java's `@Import`, Micronaut Kotlin's hand-wired handler
    list — is parsed, added to, and re-emitted in a form the same
    patch can parse again, because this command runs once per context
    and the peer context's single-shot patches anchor on text their
    own edit destroys.
  - **Go** — the alias hazard fires at **two** contexts, not the three
    `goLayout`'s doc predicted: an added context publishes a seam, so
    its own wiring file names two `package service` imports the moment
    `--consumes` is given. Every seam import is aliased
    `<context>service` rather than only the one that collides.
  - **Rust** — four crates; the driving port is `<Name>Port` rather
    than `<Name>`, because the seam crate owns a DTO called `<Name>`
    and the seam's own `lib.rs` imports both.
  - **`ts-http` / `web-components`** — the `exports` map holds depth
    (`TS2307`), `peers-meet-at-the-service-seam` holds the peer rule,
    and that rule's `pathNot` backreference is now exercised between
    two _added_ contexts, which it had never seen.

  Seven front-door refusals, each naming what to do about it: the name
  (one lowercase word, validated against the intersection of what all
  six identifier spellings accept), no project here, the flat `basic`
  layout, a composite product root, a name already taken, a
  `--consumes` that names nothing / itself / a context with no seam,
  and — the one that would otherwise be silent — a stack with no
  bounded-context adapter, where the command would scaffold nothing at
  all and report success.

  → [`keel add module`](docs/cli.md#keel-add-module)

- **End-to-end coverage of `keel add module` across the whole JVM
  grid — 24 cells, one CI job each.** The command shipped with a
  single JVM combination built on CI (Quarkus REST, Java, both build
  systems); the other fifteen combinations rested on assertions over
  emitted text plus a manual pass. Every cell of the 12 stacks × 2
  build systems grid now scaffolds three added contexts and builds
  them on a runner, under `tests/e2e/add-module-<stack>-<build>.test.ts`.

  **Typology is a real axis here, which is why the number is 24 and
  not 12.** It picks the assembly the wiring class renders into
  (`application/cli` against `application/api`) and the build file the
  new dependencies anchor in, and on Spring it moves `@ComponentScan`
  between `Main` and `Application` — so a CLI cell is an intersection
  its REST row never reaches. Eight of these cells were not in the
  manual pass either.

  What only a real build settles is the silent failure: a container
  that never discovered a handler compiles clean and starts clean.
  Each cell's build runs the emitted `<Name>WiringTest`s, which
  dispatch through the real Mediator out of the real container.

- **`--with-peer-context` on `web-components`.** Scaffolds
  `guestbook` beside `greeting` as one more workspace package, with a
  gateway at `src/infra/greeting-gateway/` importing
  `@scope/greeting/service` and nothing else of greeting's.

  **The peer ships a UI, and on this stack that is the point.** A
  browser context is elements bound to ports over the Context
  protocol, so a peer without one would leave the assembly's whole
  ordering rule untested. It brings a `<scope>-guestbook-view` with
  its own context keys and its own tag prefix — which is where the
  second context finally earns the tag rule: a bare `<scope>-view`
  would collide with greeting's, and a custom-element collision
  aborts the rest of that bundle's registrations and leaves half the
  page silently un-upgraded.

  The seam is fire-and-observe, because that is what a browser
  context publishes, so asking for a welcome genuinely publishes a
  greeting and the greeting view re-renders when the guestbook is
  signed. The cross-context call is visible on the page.

  Three patches bind it and all three are load-bearing: the ports are
  published **before** the element is defined (a definition upgrades
  parsed markup and fires `connectedCallback` synchronously), and
  `index.html` gains the element itself — without that last one the
  context is wired to a provider nobody asks. The app package also
  gains a `test` script, because the one case that drives the real
  seam with no fakes has to live in the assembly: the same test
  inside `modules/guestbook/` would import greeting's facade and fail
  `peers-meet-at-the-service-seam`, correctly.

- **`--with-peer-context` on `ts-http`.** Scaffolds `guestbook`
  beside `greeting` as one more workspace package — a bounded context
  is one package here, so the peer costs one manifest against Rust's
  four crates — with a gateway at `src/infra/greeting-gateway/` that
  imports `@scope/greeting/service` and nothing else of greeting's.

  **Which wall holds which rule is documented rather than blurred**,
  because they are not the same wall. The `exports` map is real
  enforcement for depth: `@scope/greeting/src/domain/…` is a `TS2307`
  from tsc and an `ERR_PACKAGE_PATH_NOT_EXPORTED` from Node. It
  cannot hold the _peer_ rule, because greeting's facade legitimately
  publishes its contract face — `from '@scope/greeting'` inside the
  gateway typechecks perfectly. That rule is
  `peers-meet-at-the-service-seam` in the emitted
  `.dependency-cruiser.cjs`, checked by `npm run lint`. Verified both
  ways: the facade import passes `tsc` and fails `depcruise`. So
  TypeScript's peer seam is enforced at lint time, weaker than the
  JVM's build scope and Go's `internal/`, and `docs/stacks/ts-http.md`
  says so instead of implying parity.

  The assembly binds it in `application/rest/src/guestbook.ts`, which
  `main.ts` imports and adds to the handler list — one import and one
  array entry, which is what that file's own comment promises a new
  context costs. The import is load-bearing: an unimported TypeScript
  module is never loaded, so without it the peer would typecheck,
  lint and run in nothing. `guestbook-wiring.test.ts` calls the same
  function `main.ts` calls and drives the cross-context call for
  real, with no fakes.

- **`--with-peer-context` on the Go stacks.** `keel new
--stack=go-cli|go-http --module-layout=modulith
--with-peer-context` scaffolds `guestbook` beside `greeting`, with
  a gateway at `modules/guestbook/infra/greetinggateway` that imports
  greeting's seam and nothing else of greeting's. With one context
  the modulith's central claim is asserted by nothing; this is the
  consumer that exercises it.

  **The forbidden import does not compile.** Add
  `modules/greeting/internal/domain` to that gateway and `go build`
  fails with `use of internal package … not allowed`. On that one
  point Go's wall is stronger than Rust's, where a domain type can
  still _flow_ across the seam because inference supplies the name
  the consumer cannot write — here the package cannot be reached at
  all.

  **Binding needed no patch, which is a difference and not an
  omission.** `rust-peer-context` patches `mod guestbook;` into the
  assembly root and the JVM family tells its container to scan,
  because both can emit a context that compiles and is wired into
  nothing. A Go file in a `cmd/` directory joins that package by
  existing, so `cmd/<unit>/guestbook.go` is bound the moment it
  lands. The emitted `cmd/<unit>/guestbook_test.go` drives the
  cross-context call for real, with no fakes anywhere.

  Five packages to Rust's four crates. The extra one,
  `userside/signing`, is a driving adapter rather than padding: a
  `cmd/` main cannot name `domain.SignCommand`, so the translation
  from primitives into the context's command happens inside the
  context, as `userside/cli` already does for greeting.

- **The Go modulith gains a peer seam, `userside/service`.** Every
  other family's modulith shipped one; Go's did not, so a second
  bounded context had the facade and nothing else to reach through.
  `internal/modules/<ctx>/userside/service` now declares the types a
  peer may write down — a `Greeting` DTO, an `Unavailable` error, and
  the `GreetingService` port over them — built by a `New` that takes
  the context's assembled driving port, so only the assembly can call
  it.

  The seam is here for a different reason than the JVM's or Rust's,
  and `docs/stacks/go.md` says which. There it _narrows_ what a peer
  may reach; Go has no such lever, since `internal/` is scoped to the
  project root and every package under it may import every other.
  What Go enforces is where the domain sits — behind
  `modules/<ctx>/internal/`, so a peer importing it fails to build.

  What the docs now decline to claim is the stronger version, which
  is false and was verified false on go1.24 rather than assumed:
  unnameability does not stop a peer calling through. Go's
  assignability is structural for unnamed types, so a foreign package
  can write `greeting.NewGreeter().Greet(struct{ Name string }{…})`
  and it compiles with both names undefined there. That buys coupling
  nothing declares, to a shape that breaks on the first added field —
  an argument for the seam, not a hole in it.

  `basic` is untouched: it is a single hexagon, `goLayout().service`
  is `null` there, and no file moved.

- **The module-layout dial reaches Rust, and item I is complete.**
  `keel new --stack=rust-cli|rust-http --module-layout=modulith`
  emits a Cargo **workspace**: `platform/kernel` for what no context
  owns, four crates per bounded context under `modules/`, and one
  assembly crate per deployment unit under `application/`. `basic`
  stays the default and its output is byte-for-byte unchanged, so
  nothing scaffolded before this shifts shape. With Rust done, every
  service stack in the catalog now offers both layouts.

  Rust is the most expensive family to turn the dial on and the one
  whose walls are strongest once paid for — four manifests per
  context, and a dependency that is a compile error rather than a
  review comment. `--with-peer-context` works here too, scaffolding
  `guestbook` with a gateway crate that reaches `greeting` only
  through its `user-side/service` seam.

  Two things are documented rather than glossed. `platform-kernel`
  ships a `BoxFuture` alias and every port that crosses a context
  boundary returns one, because `async fn` in a trait is still not
  dyn-compatible on rustc 1.94 and every port here is wired behind
  `Arc<dyn Port>`. And **Rust's peer seam is genuinely weaker than
  the JVM's and Go's**: the crate graph stops a consumer _naming_ a
  foreign domain type but not one _flowing_ through the seam, and the
  exact enforcement (`-Z public-dependency`) does not exist on
  stable. `docs/stacks/rust.md` states this plainly rather than
  implying parity, and the seam crate carries the rule — and the
  two-line upgrade for the day it stabilises — in its own module doc.

  The binary keeps its name under either layout, and every vertical
  Rust offers — including `keel add persistence`, see below — works
  under both.

- **`keel add persistence` under the Rust modulith.** The last Rust
  vertical to make the crossing, and the only one that changes shape
  rather than just moving: its adapters become a crate of their own,
  `modules/greeting/infra/postgres`, registered as a workspace member
  and depended on by the assembly. The `GreetingLog` and `UnitOfWork`
  ports join the context's contract crate, the `/greetings` router
  joins the `application/http` assembly, and the system clock joins
  `platform-kernel` beside the `Clock` port it implements.

  The crate is the point. A Cargo dependency is inherited by every
  dependent, so the `postgres` driver stays on the new crate's
  manifest and off both the workspace root and the contract face —
  nothing that merely names the domain compiles against a database
  driver. `humantime` rides the assembly that formats timestamps for
  the wire. `cargo tree -p greeting-domain-contract` is where a
  reviewer checks it.

  The `basic` output is byte-for-byte unchanged, so nothing scaffolded
  before this shifts shape.

- **A second bounded context in the modulith, on demand.**
  `keel new --module-layout=modulith --with-peer-context` scaffolds a
  `guestbook` context beside `greeting` and wires the seam between
  them: `guestbook` declares a `Welcome` port in its own vocabulary,
  `guestbook/infra/greeting-gateway` implements it over
  `greeting/user-side/service`, and the assembly binds the two. It is
  the only class in the project naming two contexts, and the build
  graph is what keeps it that way — `greeting.domain.contract` is not
  on its compile classpath, so reaching past the seam does not
  compile.

  Opt-in rather than default: a single-context service should not
  carry a demo context it has to delete. Available on **all twelve JVM
  stacks** — three frameworks × two languages × both entrypoint
  shapes. The guestbook tree is framework-independent (one tree per
  language); what differs is how each assembly binds the port, and
  every binding resolves the peer through its container's deferred
  handle — CDI `Instance`, Spring `ObjectProvider`, Micronaut
  `BeanProvider` — because resolving it during construction closes the
  cycle mediator → `SignHandler` → `Welcome` → `GreetingService` →
  mediator.

  Two of those bindings also need the new context **named** somewhere
  with no compile-time consequence: Spring's `@ComponentScan`
  `basePackages` list and Micronaut Java's `@Import(packages = …)`.
  Miss either and `SignHandler` is never discovered, the mediator is
  short one handler, and the application starts perfectly. Micronaut
  Kotlin has no discovery at all — `@Import` is Java-only there — so
  the handler joins its explicit wiring list by hand.

- **A container-level wiring test with the peer context.** Every
  combination now emits a `GuestbookWiringTest` beside the assembly
  that dispatches a `SignCommand` through the real `Mediator` out of
  the real container. Nothing else in the emitted project can fail
  when a handler was never discovered — the code still compiles and
  the application still boots — so this is the gate that turns a
  silently missing bean into a red build.

- **Maven end-to-end test coverage.** `tests/support/jvm-rest-e2e.ts`
  was Gradle-only at every level, so no keel Maven output had ever
  been built end to end on any of the twelve JVM stacks — the gap that
  let both Maven defects below reach `main`. A spec's `buildSystem`
  now selects `./gradlew build` or `./mvnw verify`, with the wrapper
  assertion, retried deferred action, runnable-jar path (`build/` vs
  `target/`) and dependency-cache isolation (`GRADLE_USER_HOME` vs
  `-Dmaven.repo.local`) all following it. The first case exercises the
  two-context modulith on Maven. Maven cases require `mvn` on PATH and
  a JDK 25+ `JAVA_HOME`, and skip themselves otherwise — Gradle
  provisions its own toolchain, Maven cannot.

- **The module-layout dial reaches Go.** `keel new --stack=go-http`
  (or `go-cli`) `--module-layout=modulith` carves the skeleton one
  bounded context at a time: `internal/modules/<ctx>/` holds the whole
  hexagon behind a facade, `internal/platform/` holds what no context
  owns (the `Clock` port, its fake, the observability package), and
  `cmd/<typology>/` stays the assembly point.

  Three placements are enforced by the Go compiler rather than by
  review, and the e2e case proves each by requiring a probe file to
  fail to build: the context's core hides behind its own `internal/`
  (`use of internal package … not allowed` from `cmd/`); its adapters
  sit beside that wall rather than behind it, or the assembly could
  not construct them; and the facade re-exports **nothing**, so a
  consumer can hold what a context returns but cannot name it — and
  therefore cannot implement its ports (`undefined: greeting.Greeter`).

  `basic` stays the default and emits byte-identical output to the
  previous release; the only manifest change is the `layout.basic` tag
  recording the choice, which is what keeps `keel add` resolving the
  same shape later.

- **The `modulith` module layout for `web-components`.**
  `keel new --stack=web-components --module-layout=modulith` carves the
  SPA one bounded context at a time: `platform/context` for the WCCG
  Context protocol, `modules/<ctx>/` for the hexagon — port-bound
  elements included, since they are its driving adapters —
  `application/web-app` still the shell. `basic` stays the default and
  its output is unchanged, `domain/domain-api` naming included.

  A context is one workspace package, as on `ts-http` and for the same
  reason, with a **third entry point**: `"./elements"`, for
  `defineGreetingElements()`. Registration is a side effect, and behind
  its own subpath the facade stays importable from a DOM-less program
  while the assembly can still order the definition after the context
  provider is listening. `design-system` stays a top-level package
  rather than becoming a context: it is domain-blind, every context
  consumes it, and it is the package the import map deduplicates.

- **An import map, and the design system as an external.** `index.html`
  points `@scope/design-system` at `/vendor/design-system.js` and the
  app's Vite build leaves the specifier alone. This is correctness, not
  size: a package that defines custom elements must exist exactly once
  per page, and two bundles each inlining a copy throw
  `NotSupportedError` on the second registration — a throw that aborts
  the rest of that bundle's registrations, so part of the page silently
  stops upgrading. The e2e builds the bundle and checks the split (one
  `customElements.define` in the app chunk, the design system's in the
  external, the bare specifier intact), then loads the built page in
  headless Chromium and requires both the context's element and the
  design system's atoms to have upgraded.

- **The element tag prefix is derived, and something fails when it is
  wrong.** `<scope>-<context>-<element>` is a runtime string: not a
  type, not a specifier, not a path. A typo leaves the build, the
  typecheck and the tests green while the page renders an unknown
  element as an empty inline box. `wcLayout()` derives it, and the
  emitted context carries `tests/element-tags.test.ts`, which
  re-derives the prefix from the package's own name — a different field
  of the resolver than the one that produced the tag — so the two
  disagreeing is a red test.

- **The `modulith` module layout for `ts-http`.**
  `keel new --stack=ts-http --module-layout=modulith` scaffolds the
  same walking skeleton carved one bounded context at a time:
  `platform/kernel` for the dispatch vocabulary and the registry
  mediator, `modules/<ctx>/` for the hexagon, `application/rest` still
  the assembly. `basic` stays the default and its output is unchanged.

  A context is **one workspace package**, not one per layer, and that
  is a wall decision rather than a tidiness one. In a TypeScript
  workspace the package graph enforces nothing to begin with — an
  undeclared workspace dependency resolves anyway because npm hoists
  every member into the root `node_modules`, and TS project references
  do not restrict which projects a project may import. Four packages
  per context would buy four manifests and no enforcement. The
  `exports` map is the one real wall, and one package keeps all of it
  at 1 manifest instead of 3.5: `@scope/<ctx>` reaches the facade,
  `@scope/<ctx>/service` the peer seam, and anything deeper is a
  `TS2307` from `tsc` and an `ERR_PACKAGE_PATH_NOT_EXPORTED` from
  Node. `tsLayout()` owns the map, because the aperture is a layout
  decision — and owns it together with the specifier convention, since
  the two are coupled: with no build step the map points at
  `./src/index.ts` and imports carry `.ts`, while an emitting build
  needs `./dist/index.js` and `.js`, and mixing them typechecks before
  failing at runtime.

- **A dependency-cruiser config emitted with the layout, and it fails
  closed.** Two rules are outside what module resolution can see: a
  relative path that walks into another package's tree, and an import
  that crosses layers inside one package. The emitted
  `.dependency-cruiser.cjs` carries an `enhancedResolveOptions` block
  with `extensions`, `exportsFields` and `conditionNames`, without
  which dependency-cruiser resolves every `@scope/*` import to a bare
  specifier, records no edge for it, and reports zero violations over
  a tree that is in violation — measured on the emitted project: the
  four `application/ → modules/greeting` edges disappear entirely. The
  e2e requires each rule to actually fail on a planted import, on both
  npm and pnpm.

- **`keel add persistence` on a Go modulith.** The SQL slice was
  flat-layout only — it excluded `layout.modulith` and failed with an
  uncovered dimension, deliberately, because its five packages all
  move and emitting them at flat paths would have compiled and
  silently not wired. Every destination now resolves through
  `goLayout`: the `GreetingLog` + `UnitOfWork` ports join the context's
  contract face, the pgx adapters and the fakes join
  `modules/<ctx>/infra/`, the system clock leaves for
  `platform/clocksys`, and the `/greetings` decorator joins
  `modules/<ctx>/userside/resthttp`.

  One thing the JVM never had to answer: under the modulith the
  assembly cannot import the context's domain, so the factory it wires
  has to live on the facade. The slice emits a second factory beside
  `NewGreeter` — `NewGreetingLogUseCases` — which, like its neighbour,
  re-exports nothing: `cmd/` passes in adapters and holds the result
  without ever being able to name a domain type, so `greeting.GreetingLog`
  from the assembly is still `undefined`. The e2e requires that probe
  to fail to build.

- **Go import paths are derived in one place.** `goLayout()` owns every
  module-path × layout-depth × context-name concatenation, including
  the gofmt sort order of an import block — which of two paths sorts
  first flips between the layouts. `go-bootstrap`, `go-cli-bootstrap`,
  `go-http-bootstrap`, `go-port-fake`, `go-cors` and `go-observability`
  all read from it instead of carrying path constants.

- **The Rust peer-seam stance is settled for I.4.** Rust's crate graph
  prevents naming a crate you do not depend on but not domain types
  flowing across the peer seam, and nothing on stable catches it. The
  ruling — recorded in [the roadmap](docs/roadmap.md) under I.4 — keeps
  the discipline, states it in the seam crate's own module doc rather
  than a checklist, and pre-writes the two-line switch to
  `-Z public-dependency` for the day it stabilises. Pinning every
  scaffolded Rust project to nightly to enforce one rule on one crate
  is the trade being declined. The enforcement stays open; the stance
  does not.

- **`containerization` vertical** (`keel add containerization`) — a
  thin Dockerfile (plus `.dockerignore`) beside the deployment unit
  for every HTTP-shaped stack. No build stage anywhere: the image
  copies the artifact the host build already produced and documents
  the build command instead of running it. Per stack: the Quarkus
  fast-jar layout, Spring boot jar, or Micronaut shadow/shaded jar
  onto `eclipse-temurin:25-jre` (artifact paths following the
  Gradle-or-Maven choice), the Go static binary onto distroless
  static, the Rust release binary onto distroless cc, the `ts-http`
  sources onto `node:22-alpine` (npm or pnpm install to link the
  workspace), and the SPA's Vite bundle onto `nginx:alpine` with a
  history-API fallback config. Every JVM backend poses a sticky
  `flavor` question with an opt-in **GraalVM native** image,
  promoting `runtime.graalvm-native` on top of the
  `deploy.container-image` tag every image adapter adds. Quarkus and
  Micronaut builds already produce the binary without build-file
  changes (`-Dquarkus.native.enabled=true`, `nativeCompile` /
  `-Dpackaging=native-image`); Spring's opt-in patches the GraalVM
  Native Build Tools wiring in — the `org.graalvm.buildtools.native`
  Gradle plugin beside the Boot plugin, or a `native` Maven profile
  mirroring the one `spring-boot-starter-parent` ships (the skeleton
  imports the BOM instead of that parent) — marker-guarded and
  idempotent, exercising the composition contract's patch path.
  CLI-shaped projects hard-fail with the uncovered `image`
  dimension — a CLI ships through `distribution`, not a serving
  container.
- **`observability` vertical** — production observability for every
  HTTP-service stack, greenfield (listed after `walking-skeleton` on
  the nine REST/HTTP presets) and brownfield
  (`keel add observability`). Four dimensions — the first three
  covered per stack by one adapter selected on
  `framework.*`/`lang.*` + `arch.server-http`, the fourth
  (`monitoring-stack`, described below) by a language-agnostic
  sibling adapter:
  **health** — liveness ("restart me", dependency-free by design)
  and readiness ("route traffic to me") probe endpoints,
  framework-native where the framework has them (SmallRye Health
  `/q/health/*`, Actuator `/actuator/health/*`, Micronaut Management
  `/health/*`) and hand-rolled `/health/live` + `/health/ready` on
  the Go/Rust/TS stacks, plus a template readiness check to hang
  real dependency checks on; **request-context** — one
  filter/middleware at the HTTP edge extracts-or-mints
  `X-Correlation-Id` (and the optional `X-Tenant-Id` as the
  multi-tenant worked example) into a request-scoped context and the
  log context (SLF4J MDC, `slog` context handler, `tracing` span
  fields, `AsyncLocalStorage`), echoes it on the response, and is
  the documented extension point for more propagated fields;
  **telemetry** — OpenTelemetry across the stack (traces + metrics
  over OTLP, standard `OTEL_*` env vars) with one example span
  enrichment and one example `app.http.requests` counter per stack
  (quarkus-opentelemetry, micrometer-tracing OTel bridge + OTLP
  registries, micronaut-tracing-opentelemetry + Micrometer OTLP,
  otel-go, tracing-opentelemetry, NodeSDK). Each install patches the
  bootstrap's build + config files at guarded anchors and ships a
  wire-level `ObservabilityTest` in the generated project; the
  gateway CORS adapters learned the observability-decorated assembly
  points so both verticals compose in the fullstack presets.

- **`dev-env` vertical** — the local development environment:
  `dev/compose.yaml`, one Compose file for everything the service
  needs on a laptop but does not own. The vertical seeds the empty
  base (plus a README section); supplementing verticals patch their
  services in through shared compose helpers, and ad-hoc local infra
  (a database, redis, a broker) goes in the same file — the single
  place to look for what the dev loop needs. Dev-only by design:
  production infrastructure belongs to IaC. Listed on every REST/HTTP
  stack before `observability`; brownfield via `keel add dev-env`.

- **Monitoring stack in the dev environment** — the observability
  vertical's fourth dimension (`monitoring-stack`) supplements
  `dev/compose.yaml` with a monitoring stack listening exactly where
  the service already exports (OTLP `localhost:4317/4318`, Grafana
  `:3000`). A sticky `stack` question picks the shape: **granular**
  (default) — one service per concern as the base a production setup
  grows from: an OpenTelemetry Collector as the single OTLP
  entrypoint fanning signals out to Tempo (traces), Prometheus
  (metrics via remote-write), and Loki (logs), plus Grafana
  provisioned with all three datasources, config files landed under
  `dev/observability/` ready to edit — or **lgtm**, the all-in-one
  `grafana/otel-lgtm` dev container. No install-order coupling with
  `dev-env`: contributions to `dev/compose.yaml` ride the composition
  contract's new **seeded patches** (`ContributionPatch.seed` — a
  patch that runs against a supplied seed when its target does not
  exist yet), so each vertical stands alone and whichever runs first
  creates the shared file. Quarkus projects now also enable OTLP log
  export (`quarkus.otel.logs.enabled=true`) so all three signals
  flow.

- **TypeScript backend stack** (`keel new --stack=ts-http`) — the
  Node realization of the walking skeleton: a TypeScript workspace in
  the binding-spec trisection (`domain/kernel` with the
  Command/Result/Handler/Mediator bases, `domain/contract`,
  `domain/core` exposing factories through its `exports` map — the
  registry-mediator stance keel itself is built on) plus an
  `application/rest` deployment unit on bare `node:http` mapping
  `GET /greet` to the mediator and rejections to RFC 9457 Problem
  Details. No build step: Node 22.18+ runs the sources directly
  (type stripping, held honest by `erasableSyntaxOnly`), per-package
  `tsc --noEmit` and `"types": []` hold the walls, and the sample
  `Clock` port ships real + fake adapters in `infrastructure/clock`
  (`walking-skeleton/ts-port-fake`). Projects `peer.api.rest`, so it
  slots into the same gateway seam as the other REST backends.
- **`fullstack-ts` stack** (`keel new --stack=fullstack-ts`) — the
  fourth backend behind the same seam: a `ts-http` backend +
  `web-components` frontend product selecting exactly the same
  frontend gateway adapters as the other pairs. The Node side gets
  its own CORS decoration (`gateway/ts-cors` wraps the server at the
  assembly point), the shared OpenAPI wire contract, and a
  `node:22-alpine` Dockerfile with no build stage — the container
  runs the TypeScript sources directly.
- **npm or pnpm for the TypeScript stacks** — `ts-http` and
  `web-components` offer the build-system choice: npm (hoisted
  workspaces, the default) or pnpm (`pnpm-workspace.yaml`, the
  `workspace:*` dependency protocol, a pinned `packageManager` field,
  and a `walking-skeleton/pnpm-install` adapter covering `build-tool`
  under `pkg.pnpm`). The workspace packages now declare their own
  tool devDependencies (correct under pnpm's strict layout, harmless
  under npm's hoisting), and `gateway/wc-gateway-rest` patches
  package manifests structurally so its dependency insertions follow
  whichever protocol the workspace uses.
- **Selectable build systems** (`keel new … --build-system <id>`) —
  stacks may now offer a choice of build system instead of pinning
  one. All twelve JVM stacks offer **Gradle or Maven**: the same
  hexagonal sources scaffold onto either, with per-build-system
  template trees (multi-module poms, Maven wrapper via a deferred
  `mvn -N wrapper:wrapper`, the sample-port-fake adapters registering
  their module through a root-pom `<module>` patch instead of a
  `settings.gradle.kts` include). The Kotlin twins compile through
  `kotlin-maven-plugin` declared once at the reactor root, with the
  per-framework compiler wiring each stance needs — the `all-open`
  presets for Quarkus and Spring proxying, kapt-driven
  `micronaut-inject-java` for Micronaut. Interactive installs prompt
  for the choice; non-interactive installs take the stack default
  (Gradle); `--build-system maven` pins it from the command line.
  Composite stacks scaffold each service on its default.
- **Spring Boot stacks** (`keel new --stack=spring-cli|spring-rest`)
  — the JVM walking skeleton generalised past Quarkus: the same
  hexagonal multi-module shape on Spring Boot 4.1.0, with a picocli
  CLI over the Spring container (`spring-cli`) or a Spring MVC
  `GET /greet` with an RFC 9457 Problem Details advice
  (`spring-rest`), each driven end to end by its generated test
  suite. Selected by the ordinary predicate machinery on
  `framework.spring`.
- **Micronaut stacks** (`keel new --stack=micronaut-cli|micronaut-rest`)
  — the same pair on Micronaut platform 4.10.17 (compile-time DI,
  `PicocliRunner` for the CLI, an `ExceptionHandler` for the Problem
  Details mapping), selected on `framework.micronaut`.
- **Kotlin across the JVM stacks** — every JVM stack now has a
  Kotlin twin (`quarkus-cli-kotlin` … `micronaut-rest-kotlin`):
  idiomatic Kotlin 2.3.21 over shared Kotlin domain-trisection
  template trees, with the per-framework compiler wiring each stance
  needs (allopen for Quarkus CDI, `plugin.spring` for Spring, KSP
  for Micronaut). Language is a predicate dimension like any other —
  `lang.kotlin` swaps the bootstrap _and_ the sample-port adapter
  (`sample-port-fake-kotlin`).
- **The gateway seam covers the new backends.**
  `gateway/spring-cors` (+ its Kotlin sibling) emits a
  `WebMvcConfigurer` CORS bean, `gateway/micronaut-cors` patches
  `application.properties`; `fullstack-spring` and
  `fullstack-micronaut` composite presets pair the new REST backends
  with the web-components frontend, Dockerfiles included.
- **`fullstack-rust` stack** (`keel new --stack=fullstack-rust`) —
  the third backend behind the same seam: a `rust-http` backend +
  `web-components` frontend product, selecting exactly the same
  frontend gateway adapters as the Quarkus and Go pairs because all
  three backends project `peer.api.rest`. The Rust side gets its own
  seam half — `gateway/rust-cors` layers a CORS decoration onto the
  HTTP unit's router in `main` for the Vite dev origin
  (cross-cutting as a decorator at the assembly point, per the
  binding spec's Rust stance) — plus the shared
  `contract/greet.openapi.yaml` via the language-generic
  `gateway/rest-api-contract`, and `fullstack/product-compose` learns
  a Rust backend image (musl-static cargo build onto distroless). A
  `fullstack-rust` e2e boots the real Rust backend and verifies the
  wire — named, defaulted, and rejected requests plus the CORS
  header.

- **`fullstack-go` stack** (`keel new --stack=fullstack-go`) — the
  proof that the gateway seam is generic over backends: a `go-http`
  backend + `web-components` frontend product, selecting exactly the
  same frontend gateway adapters as the Quarkus pair because both
  backends project `peer.api.rest`. The Go side gets its own seam
  half — `gateway/go-cors` decorates the HTTP unit's assembly point
  with a CORS wrapper for the Vite dev origin (cross-cutting as a
  decorator, per the binding spec's Go stance).
- **The REST seam contract is pinned as OpenAPI.**
  `gateway/rest-api-contract` emits `contract/greet.openapi.yaml` on
  any HTTP backend with an SPA peer, whatever its language:
  `GET /greet`, optional `name` defaulting to `world`,
  `{"greeting": …}` on 200, RFC 9457 problem documents on errors.
  The frontend gateway (and its fake) encode this shape, and the new
  `fullstack-go` e2e boots the real Go backend and verifies the wire
  against it — named, defaulted, and rejected requests plus the CORS
  header.
- **Monorepo products are containerised.**
  `fullstack/product-compose` emits a root `compose.yaml` plus a
  Dockerfile beside each deployment unit (Gradle multi-stage for
  `quarkus-rest`, Go-onto-distroless for `go-http`, Vite-build-onto
  nginx for the frontend, with nginx proxying `/api` to the backend
  service — the same convention as the dev proxy, so the bundle's
  default `VITE_API_BASE_URL` works unchanged in both worlds).

- **Fullstack composition: peer tags, composite stacks, and the
  `fullstack` preset.** Stacks now declare the peer tags they project
  onto sibling services (`quarkus-rest`/`go-http` → `peer.api.rest`,
  `web-components` → `peer.ui.spa`); each project's manifest records
  its own `projects` and its siblings' projections as `peers`, and
  adapter resolution runs against tags ∪ peer tags — so cross-service
  elements are ordinary predicate-selected adapters. A composite
  stack declares `services` instead of scaffolding in place:
  `keel new --stack=fullstack` scaffolds a `quarkus-rest` backend and
  a `web-components` frontend as full keel projects (own tree, own
  manifest each), under the user's choice of repository layout —
  `--layout=monorepo` (default; `vcs` hoisted to the product root,
  root README glue via the new `fullstack` vertical) or
  `--layout=polyrepo` (a repository per service, no shared root);
  prompted when interactive and unspecified.
- **The `gateway` vertical — the cross-service seam.** Declares no
  dimensions: its adapters fire purely on peer tags, so it installs
  nothing without peers. `gateway/wc-gateway-rest` (on
  `peer.api.rest`) gives the frontend the `GreetGateway` driven port,
  an `infrastructure/gateway-rest` package (fetch adapter + canonical
  fake on a `./fake` subpath so DOM-less test programs never resolve
  `fetch`), a Vite dev proxy (`/api` → `localhost:8080`) with
  `VITE_API_BASE_URL` for production, and rewrites the greet slice to
  run end-to-end across services — outcome and offline fallback both
  surfacing through the read model. `gateway/quarkus-cors` (on
  `peer.ui.spa`) allows the Vite dev origin in the backend's
  `application.properties`. Installed automatically for composite
  services; brownfield via the new **`keel link <path>`** command,
  which records two existing projects as peers of one another (both
  manifests, refs relative, re-link refreshes) followed by
  `keel add gateway` in each.
- **Rust walking skeleton with composable CLI and HTTP entrypoints.**
  Two new stacks — `rust-cli` and `rust-http` — compose the existing
  `vcs` + `walking-skeleton` verticals for Rust, realizing the house
  Rust hexagonal reference: one package per service, `src/domain.rs`
  as the contract face (commands, driving-port traits, exported
  factories) over a compiler-hidden core (`src/domain/greet.rs`, a
  private module nothing outside `domain` can name), one `src/bin/`
  directory per deployment unit wired by hand in `main`, and no
  mediator object — per the binding spec's settled Rust stance
  (per-use-case driving-port traits by default). Four new adapters:
  `walking-skeleton/rust-bootstrap` (package shell, domain,
  DIP-strict `tests/` integration test, deferred `cargo check`;
  covers `build-tool`), `walking-skeleton/rust-cli-bootstrap` (flags
  → command → port → exit code, dependency-free) and
  `walking-skeleton/rust-http-bootstrap` (`GET /greet` → command →
  port → JSON on axum + tokio, honouring the REST seam contract —
  `{"greeting": …}`, absent name defaulting to `world` at the
  transport boundary — with domain errors as RFC 9457 problem
  documents) — both covering `entrypoint`, additive so a tag set
  carrying `arch.cli` and `arch.server-http` ships both units, each
  registered as an explicit `[[bin]]` target — and
  `walking-skeleton/rust-port-fake` (the `Clock` trait with its
  canonical fake under `src/infra/`, stitched in by idempotent
  module-declaration patches; covers `port-example`). Exercised end
  to end by a Rust e2e suite (test, build, run the CLI, serve
  `/greet`).
- **The `quarkus-rest` stack — the REST entrypoint.** `keel new
--stack=quarkus-rest` scaffolds a Quarkus 3 REST service on Gradle
  in the binding-spec layout: the familiar `domain/kernel` /
  `domain/contract` / `domain/core` trisection plus the earned
  application pair `application/rest/contract` (transport DTOs) and
  `application/rest/executable` (Jakarta REST resource for
  `GET /greet?name=…`, the domain-error → RFC 9457 Problem Details
  mapper, and the CDI composition root), driven end to end by a
  `@QuarkusTest` + RestAssured test. The new
  `walking-skeleton/quarkus-rest-bootstrap` adapter covers the same
  `entrypoint` dimension as the CLI bootstrap under
  `framework.quarkus + arch.server-http` — the first proof that the
  entrypoint is selected by predicate, not hard-coded.
- **Go walking skeleton with composable CLI and HTTP entrypoints.**
  Two new stacks — `go-cli` and `go-http` — compose the existing
  `vcs` + `walking-skeleton` verticals for Go, realizing the house Go
  hexagonal reference: one module per service, `internal/domain` as
  the contract face (commands, driving ports, exported factories)
  over a compiler-hidden core in `internal/domain/internal/`, one
  `cmd/` directory per deployment unit wired by hand in `main`, and
  no mediator object — per the binding spec's settled Go stance.
  Four new adapters: `walking-skeleton/go-bootstrap` (module shell,
  domain, DIP-strict domain test, deferred `go mod tidy`; covers
  `build-tool`), `walking-skeleton/go-cli-bootstrap` (flags →
  command → port → exit code) and `walking-skeleton/go-http-bootstrap`
  (`GET /greet` → command → port → JSON, domain errors as RFC 9457
  problem documents) — both covering `entrypoint`, additive so a tag
  set carrying `arch.cli` and `arch.server-http` ships both units —
  and `walking-skeleton/go-port-fake` (the `Clock` port with its
  canonical fake under `internal/infra/clockfake`; covers
  `port-example`). The generated projects are stdlib-only and are
  exercised end to end by a Go e2e suite (vet, test, build, run the
  CLI, serve `/greet`).
- **`web-components` stack** (`keel new --stack=web-components`) —
  the walking skeleton's frontend realization, mirroring the house
  hexagonal reference for the browser: a framework-free
  web-components SPA as a TypeScript npm workspace. The
  `walking-skeleton/wc-spa-bootstrap` adapter emits
  `domain/domain-api` (ports, commands, read models — compiled with
  `"lib": ["ES2022"]`, so touching the DOM is a tsc error),
  `domain/domain-core` (an `exports` map exposing only factory entry
  points, so deep imports fail at module resolution), and an
  `application/web-app` Vite deployment unit whose `main.ts` is the
  assembly point — ports delivered to custom elements over the WCCG
  Context protocol, no mediator, cross-cutting via factory
  decoration, per binding spec §2. `walking-skeleton/wc-sample-port-fake`
  adds the sample `Clock` port with real (`systemClock`) and fake
  (`createFakeClock`) adapters side by side in
  `infrastructure/commons`, plus a contract test;
  `walking-skeleton/npm-install` covers the `build-tool` dimension
  under `pkg.npm` with a deferred `npm install`, the npm counterpart
  of `gradle-wrapper`.
- **Design system in the web-components skeleton** — the
  `walking-skeleton/wc-design-system` adapter (co-firing with the
  bootstrap) emits a `design-system/` workspace package following
  atomic design on top of `@rgoussu.dev/planks`: planks layout
  primitives + token scale as the sub-atomic substrate, a project
  brand-token layer (`tokens.css`), a button atom and a
  greeting-card molecule (attributes in, `CustomEvent`s out, tested
  under happy-dom), all domain-blind — the package declares no
  dependency on the domain, so a domain-aware "atom" fails at module
  resolution. The scaffolded shell and the greet organism compose it
  (planks `<center-pk>`/`<stack-pk>`/`<cluster-pk>` layout, state
  pushed down as attributes); everything renders in the light DOM,
  matching planks' tag-scoped styling convention.

### Changed

- **The `Prompt` port carries an `Asker`.** `ask(question, asker)`
  names who is asking — a composition adapter, a stack-level dial, or
  the provisioning context. A question id is unique within its asker
  and nowhere else, and the two record their answers in completely
  different places (`manifest.answers[adapterId]` versus a field of the
  command), so a non-terminal front end cannot route an answer back
  without it. Affects anyone implementing the port directly; the
  shipped `FakePrompt` now also records the askers it saw.
- **`InstallTarget` names what to install** independently of which
  command carries it (`domain/contract/commands.ts`), with
  `installCommandFor` as the single mapping to a command — so
  `keel.preview` and a committing install cannot disagree about what a
  target means. It mirrors `NewProjectCommand` field for field, an
  optional `stack` included: absent asks for it, exactly as an omitted
  `--stack` does.
- **The pre-commit hook's format step is now sentinel-delimited**, so
  `code-style` can wire a formatter into an already-emitted hook —
  greenfield and brownfield through one mechanism. The hook's
  behaviour is unchanged where a formatter already existed (Go, Rust).
- **Enforcement is hook-fixes / CI-checks.** `isEnforceCheck = false`
  on Gradle and no lifecycle binding on Maven, so a formatting drift
  never fails `./gradlew build` or `mvnw verify`; the pipeline gates
  on it instead. Without this a formatter disagreement would break a
  freshly scaffolded project's very first build.

- **Every emitted-template pin bumped to the latest stable its feed
  reports** — the version-currency registry's first full sweep.
  Quarkus platform 3.38.2 (and the Gradle stacks' `gradle.properties`
  finally agreeing with Maven's pin), Micronaut platform 5.1.1 with
  its Gradle plugin 5.0.2 and Data TX 5.1.1, Kotlin 2.4.10, JUnit
  Jupiter 6.1.3, Flyway 13.3.0 with the CLI
  image lifted to the same major, Shadow 9.6.1, Gradle wrapper 9.7.0
  (keel's own e2e host Gradle moves with it), GraalVM Native Build
  Tools 1.1.9, protobuf-java 4.35.1 (the Micronaut Maven compatibility
  pin follows Micronaut 5's OTel gencode), Node images and CI
  node-version to the 24 LTS, TypeScript ^6.0.0, Vitest ^4.1.0,
  @testcontainers/postgresql ^12.1.0, Vite ^8.2.0, @rgoussu.dev/planks
  ^0.3.1, Go 1.26, the
  emitted workflows' action majors (checkout v7, setup-go v7,
  setup-java v5, setup-node v7, docker login v4, upload-artifact v7,
  download-artifact v8, gh-release v3) and the monitoring images
  (otel-collector 0.159.0, Tempo 3.0.3, Prometheus 3.14.0, Grafana
  13.2.0, otel-lgtm 0.30.2). Four deliberate holds, each recorded
  beside its registry entry: `jakarta.inject-api` stays 2.0.1 (the
  `.MR` upload is a maintenance re-tag, not a newer library),
  `@types/node` moves to ^24 to match the Node major the scaffolds run
  rather than npm's latest, TypeScript stays below 7 because
  dependency-cruiser — the tool holding the emitted seam wall —
  supports `>=2 <7` and cruises nothing under 7, and Testcontainers
  stays on the latest 1.x because 2.x renames the per-database module
  artifacts the templates use. The Micronaut 5 platform BOM stopped
  managing `jackson-module-kotlin` under Maven, so the Micronaut
  Kotlin templates now carry its version explicitly (2.22.2).
  PostgreSQL 18, MariaDB 12 (the long-term series; 13.0 is rolling),
  Alpine 3, JDK 25 LTS, KSP 2.3.11, setup-graalvm v1 and Loki 3.7.6
  were already current.

- **The SPA's containerization target is now an assets image — a
  breaking change to the (unreleased) emitted artifact shape.**
  `containerization/wc-spa-image` used to bake the Vite bundle onto
  `nginx:alpine`; it now emits an image containing **only the
  bundle**, whose entrypoint clears a mounted volume, copies the
  bundle in, templates `env.js` from the environment, and exits.
  Serving is deploy-time wiring: the emitted `compose.yaml` runs the
  assets image as an init container (`restart: 'no'`, nginx gated on
  `service_completed_successfully`) and an **unmodified official
  nginx** serves the named volume with the history-API-fallback
  config mounted read-only. The clear-then-copy order is load-bearing
  — stale files from the previous release must not survive — and
  tested. Why: the bundle's lifecycle decouples from the server's — a
  frontend release replaces the assets image and re-runs it; nginx
  never rebuilds — and deploy-time `env.js` is what makes one bundle
  serve every environment. `fullstack/product-compose` migrated to
  the same shape in the same change: the root compose gains the named
  volume and the stock nginx service, whose `/api` proxy target is
  now an env-configured `BACKEND_URL` (defaulting to the sibling
  service) substituted by the official image's envsubst entrypoint
  instead of a hostname baked into a custom image.

- **README reorganized for first-time users** — prose trimmed in
  favor of a stack matrix, per-family "How to" sections (command +
  what you get + prerequisites), a composition diagram, and a
  verticals table; the deep material moved to `docs/` with
  cross-links.

- **README reframed around the bootstrapper.** The tagline and _Why
  keel_ now lead with what `keel new` produces — a runnable,
  production-shaped walking skeleton in under a minute — with the
  composition engine and the Claude Code workflow kit presented as
  how and why it holds, instead of leading with the convention kit
  and mentioning scaffolding last. The _Verticals shipped_ section
  also catches up with the surface: Gradle **or Maven** on the JVM,
  the Rust and TypeScript skeletons, npm **or pnpm** workspaces, and
  the TypeScript backend's CORS half of the gateway seam.
- The npm package description follows the same reframing — it now
  leads with the bootstrapper instead of the workflow kit.
- **The gateway CORS seam is dev-only across every fullstack
  backend.** The accommodation for the Vite dev origin no longer
  reaches production, each stack using its own idiom: Quarkus
  properties are `%dev.`-scoped, the Spring `CorsConfig` bean is
  `@Profile("dev")`, Micronaut's properties move to a dev-environment
  `application-dev.properties`, the Go wrapper is a no-op unless
  `GO_ENV=dev`, the Rust decoration is gated on
  `cfg!(debug_assertions)` (release builds pass through), and the
  Node wrapper is a no-op under `NODE_ENV=production` (which the
  `backend-ts` image now sets). The Go and Rust wrappers also answer
  preflights completely (`allow-methods` + echoed `allow-headers`),
  matching the ts-cors fix below, and the product README's run hints
  show each stack's dev activation.
- **The JVM stacks target Java 25 (latest LTS).** Every JVM bootstrap
  now pins the JDK through a Gradle toolchain
  (`JavaLanguageVersion.of(25)`) instead of bare
  source/targetCompatibility flags, with the
  `foojay-resolver-convention` settings plugin so a machine without a
  local JDK 25 auto-provisions one instead of failing the first
  build. On the Kotlin twins the Kotlin compiler derives its
  `jvmTarget` from the same toolchain, replacing the explicit
  `JvmTarget.JVM_21` wiring. The fullstack backend images build on
  `gradle:jdk25` and run on `eclipse-temurin:25-jre`, the
  `quarkus-cli-native` workflows set up GraalVM for JDK 25, and the
  stack descriptions say so. The Maven build trees pin the same
  version (`maven.compiler.release`, the Kotlin `jvmTarget`, and the
  Micronaut `jdk.version`/`release.version` properties). The
  surrounding versions already
  supported 25 (Gradle 9.4.1, Quarkus 3.34.6, Spring Boot 4.1.0,
  Micronaut 4.10.17, Kotlin 2.3.21), so this closes the roadmap's
  "latest LTS" drift.
- **The JVM bootstraps share their domain templates.** The domain
  trisection is emitted from shared per-language trees
  (`assets/composition/walking-skeleton/jvm-domain/`) rather than
  being duplicated per framework, and all twelve JVM bootstrap
  adapters are built by one `jvmBootstrapAdapter` factory keyed on
  (framework, arch, language). Rendered output for the existing
  Quarkus stacks is unchanged. `sample-port-fake` (plain Java + a
  plain Gradle module) now fires for every Java JVM bootstrap
  (`runtime.jvm + lang.java`), not just Quarkus.
- **`walking-skeleton/sample-port-fake` now fires for both project
  shapes**: its predicate loosened from requiring `arch.cli` to
  `framework.quarkus + arch.hexagonal`, and it reads `basePackage`
  from whichever bootstrap ran. `keel add distribution` on a
  `quarkus-rest` project still hard-fails with uncovered dimensions —
  the REST-shaped distribution adapter is the next roadmap item.

### Fixed

- **A free-form interactive question's `doc` was invisible.** The
  inquirer adapter surfaced an adapter-written `Question.doc` as each
  choice's own description on a `select` question, but a free-form
  `input` question — which `@inquirer/prompts` gives no description
  slot of its own — silently dropped it. It now appends the doc on its
  own line under the prompt.

- **`--with-peer-context` on Rust no longer warns.** The emitted
  `guestbook.rs` wiring exposed `pub fn wire()`, which nothing in
  `main` calls, so every `cargo build` of a Rust peer-context project
  reported `function 'wire' is never used`. The added-context
  templates already carry `#[allow(dead_code)]` with an explanation
  telling you to delete it once `main` calls the function; the peer's
  wiring now says the same thing, including the part that catches
  people out — the test below it drives `wire()`, and that is not a
  use `cargo build` counts.

- **The web-components wiring test drives the real seam of an added
  context, not a fake of it.** When `--consumes` named a context that
  `keel add module` had itself added, the emitted assembly test stood
  up a hand-written `<Consumes>Service` object, because building the
  real one would have meant knowing what _that_ context consumes —
  which only its own wiring module knows.

  So the wiring module now says it. Every web-components context
  gains `create<Name>ContextService()`, a fresh self-contained
  instance that assembles its own consumed chain, which is the shape
  `ts-http`, Rust and Go already had and the invariant the family was
  missing: a consumer reaches an added context through _that
  context's own wiring function_. The test calls it and never names
  what the consumed context consumes.

  It is deliberately separate from `create<Name>Wiring`, which stays
  the single live instance `main.ts` holds — a second call there
  would build a second store and split the page's state from its
  peers', which is what that function's own note warns about.

- **Reserved module names now cover every target language's
  keywords.** `parseModuleName` claimed to reject anything "reserved
  in at least one of Go, Rust, Java or Kotlin" and rejected about a
  third of them: `keel add module case` scaffolded a tree whose Java
  package clause is a syntax error, `keel add module map` one whose Go
  package clause is. The list is now four per-language arrays plus the
  structural one, so the claim is checkable against each language's
  grammar rather than invisible in a merged list.

- **`keel add module` installs the workspace it just widened**, on
  `ts-http` and `web-components`. A workspace package the root
  manifest now lists but the store has never seen is not resolvable —
  nothing symlinks it into `node_modules` — so every import of the new
  context was a `TS2307` and a project keel had just reported as ready
  did not typecheck. `keel new` gets the install for free from the
  walking skeleton's own adapter running last; anything layered onto a
  live project has to ask for it, as `ts-persistence` already did.

- **`--with-peer-context` on a stack that has no peer context was a
  silent no-op.** `keel new --stack=go-http|ts-http|web-components
--module-layout=modulith --with-peer-context` accepted the flag,
  emitted a single bounded context, and exited 0 — the user asked for
  two contexts, was told nothing, and got one. The flag is now
  rejected at the front door with the stack named and the supported
  stacks listed.

  The gap was structural rather than an oversight. Every other "no
  adapter for this stack" is caught by the resolver's
  uncovered-dimension hard-fail, and a peer-context adapter declares
  `covers: []` — it contributes a _context_, not a dimension — so a
  family with no such adapter resolves cleanly and emits nothing.
  The new check is derived from the adapter set rather than from a
  list of stack ids, so a family gaining its adapter opens the front
  door by itself; a written-down list would go stale in the same
  silence.

  The layout rejection's wording changed with it. It said a second
  context "meets the first at user-side/service", which is the JVM
  and Rust spelling of the seam — Go has no such path — so it now
  names the seam without spelling a path no stack of that family has.

- **A Micronaut modulith on Maven could not be built at all.** Every
  module of the reactor except the assembly parents the reactor root,
  and that root managed no versions — so the one library module
  carrying Micronaut types (`user-side/api/adapters` for REST,
  `user-side/cli` for the CLI) declared `io.micronaut:*` coordinates
  with no version anywhere to resolve them from. Maven failed before
  compiling anything, while reading the POMs:
  `'dependencies.dependency.version' for io.micronaut:… is missing`.
  The reactor root now imports `io.micronaut.platform:micronaut-platform`
  in `dependencyManagement`, which is the same BOM the assembly gets by
  parenting `micronaut-parent`. Affects all four Micronaut modulith
  stacks on Maven — REST and CLI, Java and Kotlin.

  Gradle was never affected: the Micronaut plugin applies the platform
  to each project it is applied to, so nothing there depends on the
  root. The defect survived because no Micronaut project had ever been
  built with Maven, in any layout or language — the Maven e2e coverage
  added alongside the peer context only reached Quarkus and Spring.

- **A Micronaut library module contributed no beans under Maven.**
  Micronaut resolves beans at compile time and does it per compiled
  module, so the modulith's one framework-facing library module — the
  `@Controller` under `user-side/api/adapters`, the `@Command` under
  `user-side/cli` — has to run the annotation processor itself. Its
  Maven pom had no `<build>` section at all, so it did not. The
  failure was entirely silent: sources compiled, the jar was produced,
  the application started, and every route 404'd. The Gradle twin was
  never affected — it applies `io.micronaut.library`, which is exactly
  this. The four Micronaut modulith stacks now configure
  `micronaut-inject-java` as an annotation-processor path, through
  `kapt` on the Kotlin ones.

- **Micronaut's OTLP registry resolved an unusable protobuf under
  Maven.** `micronaut-micrometer-registry-otlp` ships
  protobuf-generated classes that call
  `com.google.protobuf.RuntimeVersion`, which exists only in
  protobuf-java 4.x — but it asks for 4.28.3 in its Gradle module
  metadata and 3.25.8 in its POM. Gradle reads the first and resolves
  a working classpath; Maven reads the second and resolves a broken
  one, where the meter registry cannot be instantiated
  (`NoClassDefFoundError com/google/protobuf/RuntimeVersion$RuntimeDomain`)
  and every `@MicronautTest` in the assembly fails before exercising a
  route. The emitted pom now pins protobuf-java to the version Gradle
  picks. Affects **both module layouts** — `basic` was equally broken,
  and equally unbuilt.

- **The Go persistence slice's pgx contract test could never pass
  against a real Docker daemon.** It started its Testcontainers
  PostgreSQL with no wait strategy, so the container was declared ready
  the instant it started — and PostgreSQL restarts itself once after
  first-time init, so the very next connection was reset
  (`failed to receive message: unexpected EOF`). The test now passes
  `postgres.BasicWaitStrategies()`, which waits for the readiness log
  twice, exactly as the module ships it for.

  It hid for as long as it did because the test skips itself without a
  daemon, and no environment that ran it had one. Running the e2e suite
  in CI is what surfaced it.

- **`ts-http` documented a wall it does not have.** The emitted README,
  the stack page and the README all said the domain packages'
  `"types": []` made a domain import of `node:*` a compile error. It
  does not: `types: []` suppresses the automatic global `@types`, while
  an explicit `import … from 'node:async_hooks'` still resolves and
  typechecks clean — checked against a scaffolded `basic` project, so
  the claim was wrong from the start. The `exports` map is the wall
  that does hold, and is now what the docs point at; "the domain never
  imports the platform" is stated as a review rule under `basic` and
  enforced by the `modulith` layout's `domain-knows-no-platform`
  dependency-cruiser rule.

- **`observability` emitted its package but never wired `main.go` on a
  Go modulith.** The `cmd/http/main.go` patch anchored on the flat
  import path, so under `layout.modulith` it matched nothing and the
  adapter's drift guard silently returned the file unchanged — probes,
  correlation ids and telemetry all present on disk and none of them
  reachable. `go build` stayed green throughout, because unwired code
  compiles. Both the patch target and the import now resolve through
  `goLayout`.

- **The Maven modulith leaked the provider's domain past the peer
  seam.** `greeting-user-side-service` declared
  `greeting-domain-contract` at default `compile` scope, which Maven
  resolves transitively — so any peer depending on the service module
  also got the greeting domain on its compile classpath, and the
  property the whole layout exists to enforce silently did not hold.
  (The Gradle twin was always correct: `implementation` scope.) The
  dependency is now `<optional>true</optional>`, Maven's only
  non-transitive compile scope. Verified by building a three-module
  reactor: the peer compiled an import of the provider's domain
  before the fix and fails to resolve it after.

- **The modulith's composition root could not survive a second
  context.** Producing the peer-facing service eagerly while building
  the mediator closes a construction cycle (mediator → handler →
  port → service → mediator); the container recursed until the stack
  ran out. The peer port is now bound from a lazily-resolved
  `Instance`, which is also how a remote gateway would behave. Only
  reachable with `--with-peer-context`, so no released project is
  affected.

- **The `modulith` module layout for the JVM stacks.**
  `keel new --module-layout=modulith` (or the new interactive "Module
  layout" question) scaffolds the walking skeleton carved one bounded context
  at a time: `platform/kernel` for the dispatch vocabulary,
  `modules/<context>/` for a whole hexagon
  (`user-side/{api,cli,service}` + `domain/{contract,core}` +
  `infra/`), and `application/<typology>` for the runnable assembly
  that mounts them. All twelve JVM combinations (Quarkus / Spring /
  Micronaut × CLI / REST × Java / Kotlin) on Gradle and Maven alike.
  The distinguishing piece is `user-side/service`: the in-process
  driving adapter a **peer module** consumes through a driven port it
  declares in its own vocabulary — the only dependency edge allowed
  between modules, and the seam that turns extracting a context into
  its own service into a wiring change. The service module declares
  its domain as `implementation` scope, so a peer physically cannot
  compile against it. `basic` — the flat trisection — stays the
  default, and a manifest carrying no `layout.*` tag resolves to it,
  so nothing about existing projects changes. A new e2e test builds a
  generated modulith project with the real toolchain, runs its suite
  and drives `/greet` against the booted assembly, beside the existing
  per-framework ones.
- **Layout as a composition primitive.** `layout.basic` /
  `layout.modulith` capability tags, a `Stack.moduleLayouts` option
  list mirroring `buildSystems`, and `--module-layout` on `keel new`
  (rejected, with a message, for stacks that ship one layout and for
  composite stacks). Adapters that write outside their own template
  tree now read paths and packages from `jvmLayout(tags)` instead of
  naming a directory, so `observability`, `containerization`,
  `gateway` and `persistence` compose on either layout:
  observability lands in the assembly, where correlation ids and
  probes belong, and persistence in the bounded context, where its
  port belongs. `jvmLayout` also derives Maven artifactIds and the
  depth back to the project root, so no adapter hand-computes a
  `<relativePath>` or a `filesystem:` migration location again.
- **The `persistence` vertical** — SQL persistence for every HTTP
  stack (`keel add persistence`), PostgreSQL as the default engine
  behind an extensible engine spec. Five dimensions: a `datasource`
  (the stack's idiomatic pool — Agroal, Hikari, pgx, the sync
  `postgres` crate, `pg` — env-only prod config, compose database in
  dev, throwaway Testcontainers PostgreSQL in tests, pool health →
  readiness and pool metrics/JDBC spans → telemetry with the
  observability vertical on the JVM); transaction management as a
  **domain secondary port** shaped as a Unit of Work, with per-stack
  adapters (JTA on Quarkus, `TransactionTemplate` on Spring,
  `TransactionOperations` on Micronaut, the transaction riding the
  context on Go / `AsyncLocalStorage` on TS, a shared-connection
  transaction on Rust) beside canonical counting fakes; a repository
  example (`GreetingLog` port, SQL adapter contract-tested against a
  Testcontainers PostgreSQL that skips without Docker, in-memory
  fake, record/list operations demarcating writes with the unit of
  work, `POST`/`GET /greetings`); **migrations as their own
  deployment unit** (`migrations/` — plain-SQL Flyway scripts in a
  self-contained container run against the database before the
  service deploys, never from inside it, with dev/test replaying the
  same SQL at startup as a local-loop convenience); and the dev
  database + healthcheck-gated migrations one-shot patched into
  `dev/compose.yaml`. Covered per stack by one predicate-selected
  adapter: Quarkus/Spring/Micronaut in Java and Kotlin (Gradle or
  Maven), `go-http`, `rust-http`, `ts-http`. On the JVM the vertical
  serves **both module layouts**: under `layout.modulith` the driven
  port and its handlers land in the bounded context
  (`modules/<context>/domain/…`), the JDBC and unit-of-work adapters
  in `modules/<context>/infra/`, the `/greetings` resource in the
  context's `user-side/api/adapters`, and only the datasource,
  migration config and framework boot test in the
  `application/api` assembly — so extracting the context into its own
  service takes its persistence with it.
- **`@DomainHandler` — container discovery of handlers on the JVM
  stacks.** Handlers in scaffolded projects now carry a marker the
  **domain owns** (`domain/contract`), so a new aggregate no longer
  needs an edit in the composition root. No framework stereotype ever
  appears in domain code: the marker is meta-annotated only with
  Jakarta specification APIs (`jakarta.inject`,
  `jakarta.enterprise.cdi-api`), declared `compileOnly`/`provided` so
  neither reaches a runtime classpath, and each composition root reads
  the same marker in its own idiom — a CDI stereotype for Quarkus (the
  domain modules ship a `beans.xml` marking them bean archives), a
  `@ComponentScan` include filter for Spring, and `@Import` for
  Micronaut Java. Mediator factories now take the discovered
  collection instead of constructing handlers by hand, and the
  `persistence` vertical's greeting-log handlers ride the same
  marker — so on Quarkus and Spring it no longer rewrites the
  composition root at all, and on Micronaut Java it only names the
  new package in `@Import` (which does not scan sub-packages).
  Micronaut Kotlin keeps its explicit wiring in both verticals.
- **Dedicated documentation under `docs/`** — cross-linked pages for
  every stack family (`docs/stacks/`: JVM, Go, Rust, `ts-http`,
  `web-components`, fullstack) and every vertical
  (`docs/verticals/`), each with explicit prerequisites (toolchains
  on PATH, env vars), the questions asked, and the generated tree;
  plus a full CLI reference (`docs/cli.md`), the composition model
  with diagrams (`docs/composition.md`), and contributor/maintainer
  guides (`docs/development.md`, `docs/release.md`).
- **`CONTRIBUTING.md`** — the fork → branch → PR contribution
  workflow, commit conventions, and pointers into the docs.

- **Adapter patches preserve the patched file's line endings.** Every
  text patch (the gateway CORS decorations, the Cargo/README/module
  registrations of the walking-skeleton adapters, the Spring native
  build wiring, the observability and dev-env patchers) spliced
  LF-only content, mixing endings in brownfield CRLF files — e.g.
  Windows checkouts under `core.autocrlf` — and multi-line anchors
  (`rust-cors`'s serve block, the observability assembly-point
  rewires) failed to match outright on them. Patches now share the
  `eolOf` / `withEol` / `eolAware` helpers: simple splices convert
  their fragments and anchors to the file's dominant EOL, and the
  multi-anchor patchers run on LF-normalized text with the file's
  EOL restored after. LF files round-trip byte-identical.
- **`fullstack/product-compose` ships a `.dockerignore` beside every
  Dockerfile.** Its multi-stage builds `COPY . .`, so the whole
  context — including `.env` and package-manager rc files — reached
  the builder (and, for the single-stage `ts-http` image, the final
  image). Each deployment unit now excludes VCS metadata, secrets,
  and host build outputs (`build`/`target`/`bin`/`node_modules`/
  `dist`) from its context.

- **The `ts-http` 500 problem detail is redacted in production.**
  The rejected-dispatch handler echoed `error.message` to clients
  unconditionally; under `NODE_ENV=production` the detail is now the
  generic `unexpected failure`, while dev and test keep the real
  message. The generated test suite pins both. (Post-merge review
  finding from #32.)
- **The `ts-http` request handler no longer leaves the response
  hanging on a rejected dispatch.** The generated `server.ts` chains
  `.catch()` onto `mediator.dispatch(…)` and maps unexpected failures
  to an RFC 9457 500 problem document; the generated test suite pins
  the behaviour. (Post-merge review finding from #31.)
- **`gateway/ts-cors` answers preflights completely.** The `OPTIONS`
  branch now sends `access-control-allow-methods` and echoes any
  `access-control-request-headers`, so a browser preflight that does
  fire is actually satisfied instead of blocked. (Post-merge review
  finding from #31.)
- **`go-http` now honours the REST seam contract.** Its greet reply
  was `{"message": …}` where the Quarkus REST unit replies
  `{"greeting": …}`, and it rejected an absent name where Quarkus
  defaults to `world` — so one frontend gateway could not serve both
  backends. Absent names now default at the transport boundary; a
  present-but-blank name still reaches the domain and is rejected as
  an RFC 9457 problem.
- **Composite-service peer refs are correct at any nesting depth.**
  `keel new` recorded a sibling's `peers` ref by prefixing `../`,
  which is only right for single-segment service paths; refs are now
  computed relatively, so nested layouts (e.g. `apps/backend` +
  `apps/frontend`) project correctly.
- **`gateway/go-cors` fails loudly on a diverged assembly point.**
  When `cmd/http/main.go` no longer contains the serve call the
  adapter knows how to wrap, the install now hard-fails with a clear
  message instead of appending a decorator that never runs.
- The npm package description no longer advertises "schematics" —
  the engine retired in v0.4.0-alpha — and describes the
  composition-driven scaffolding instead.
- `docs/roadmap.md` no longer presents the REST entrypoint as the
  recommended next step: landed work (quarkus-rest, the Go / Rust /
  web-components skeletons, fullstack composition and the gateway
  seam, the Spring / Micronaut / Kotlin generalisation) is collapsed
  into a "landed" summary, and the remaining items (container-image
  distribution, CI vertical, AGENTS.md addenda, server-side
  TypeScript stack) are restated against the current surface.
- README quickstart now describes the layout the v0.5 skeleton
  actually scaffolds (`domain/kernel`, `domain/contract`,
  `domain/core`, `application/cli`, plus the emitted `AGENTS.md` +
  `CLAUDE.md` pointer) instead of the pre-v0.5 `infrastructure/cli`
  shape, and the `quarkus-cli` seed-tag list includes `runtime.jvm`.

- **The mutation run aborts on its own dry run.** Every push to `main`
  since the single-source pins landed has failed
  `.github/workflows/mutation.yml` before testing a single mutant:
  Stryker runs the suite against an _instrumented_ copy of the tree,
  where every mutable literal is wrapped in a mutation switch, and
  `tests/version-pins.test.ts` — a text sweep over the sources rather
  than a behavioral test — reported 19 dead registry locations against
  files it was never meant to read in that form. The guard now sits
  beside `tests/e2e/` in `vitest.stryker.config.ts`'s exclusions,
  which it earns twice over: a text sweep sees the mutant in the
  source rather than in the behavior, so leaving it in would score a
  blanked version literal as a killed mutant. It keeps running in
  `verify`, against the real tree, on every push and PR. The workflow
  is report-only, so nothing was gated on the red — but the mutation
  signal was dark for the duration.
- **Web sessions verify the Gradle they install again.** The pin bump
  moved the wrapper to 9.7.0 while `.claude/hooks/session-start.sh`
  still knew only 9.4.1's SHA-256, so every web session took the
  hook's warn-and-continue path and unpacked unverified bytes — loud,
  by design, and still a gap. The 9.7.0 digest joins `GRADLE_SHA256`,
  obtained from Gradle's published checksums on an unrestricted
  network and confirmed against a download taken here; both paths
  agree. `docs/development.md` records that cross-check as the
  procedure, distinct from the thing it warns against — hashing our
  own download and calling the result published.

- **The `web-components` dev server now serves the vendored design
  system under `--module-layout=modulith`.** `vite build` already
  copied the design system's build output to where the import map in
  `index.html` expects it (`/vendor/design-system.{js,css}`), but
  `vite dev` never did — that copy runs from a Rollup `closeBundle`
  hook, which only fires on a real build. Every custom element the
  design system defines silently failed to upgrade under `<pm> dev`,
  with nothing in the console to point at why. A new
  `serveVendoredDesignSystem()` Vite plugin serves the same two files
  straight from the design system's `dist/` while the dev server is
  running, and the root `dev` script now builds the design system
  first so it exists before the app's dev server starts.
- **The `web-components` `dev` script now binds every interface**
  (`vite --host`, both layouts), not just loopback. Vite's own default
  is `localhost`-only, which is invisible to whatever forwards a port
  in from outside a container or a remote dev environment — from
  inside, the server looked and behaved correctly; from anywhere that
  matters for previewing it, it looked like nothing was listening at
  all.

## [0.5.0-alpha] — 2026-08-09

### Changed

- **keel now dogfoods its own binding spec.** The source tree is
  trisected into `domain/` (kernel ← contract ← core), `application/`
  (`cli/contract` interface adapter + `cli/executable` composition
  root), and `infrastructure/` (one directory per port). Business
  operations dispatch as commands (`keel.new-project`,
  `keel.add-vertical`) through a `RegistryMediator` over handlers that
  self-declare via `supports()`; expected failures return
  `Result`-wrapped `DomainError`s that the CLI maps to stderr + exit
  code 1. All technology (fs, EJS, inquirer, chalk, `spawnSync`) sits
  behind ports — `Tree`, `Prompt`, `Logger`, `Clock`, `ManifestStore`,
  `TemplateSource`, `ProcessRunner` — each shipping a canonical
  in-memory fake beside its real adapter.
- **The agent-instructions files migrated to the AGENTS.md
  convention** — in this repo (the contributor guide is `AGENTS.md`;
  `CLAUDE.md` is a one-line `@AGENTS.md` import) and in scaffolded
  projects: the `walking-skeleton/claude-core` adapter now emits the
  binding spec as `<project>/AGENTS.md` plus the `CLAUDE.md` pointer,
  instead of `<project>/.claude/CLAUDE.md`, and the canonical asset
  moved to `assets/project/AGENTS.md`. Existing projects keep their
  `.claude/CLAUDE.md` until re-scaffolded.
- **Binding spec §2 now states the settled per-language dispatch
  stances**: commands through one explicit dispatch seam everywhere;
  registry Mediator on the JVM (and server-side TypeScript), enum +
  exhaustive match as Rust's unified-seam form, no mediator object in
  Go or the frontend (per-use-case ports + decorators). Mirrors the
  knowledge-base ruling of 2026-08-09.
- **CLI output ordering.** The planned-changes listing now prints
  after deferred actions run (the plan is part of the command's
  result). Dry-run output is unchanged.
- **Node 20 support dropped** (`engines.node` is now `>=22`). Node 20
  reached end-of-life in April 2026, and the enforced-dependency-rule
  tooling follows the node.js release cycle; CI now verifies on
  Node 22 and 24.
- The composition layer's deferred side effect is renamed `Action` →
  `DeferredAction` to keep it distinct from the kernel's dispatchable
  `Action` base; `InMemoryTree` is renamed `FsTree` and lives in
  `infrastructure/tree` (it stages in memory but reads/commits the
  real filesystem).

### Added

- **The scaffolded walking skeleton now follows the binding spec's
  layout itself**: a `domain/kernel` Gradle module owns the
  `Command`/`Handler`/`Mediator` bases; `GreetCommand` (the public
  surface) moves to `domain/contract`; the mediator implementation is
  named `RegistryMediator`; and the CLI — a primary adapter — moves
  from `infrastructure/cli` to `application/cli` (one module, per the
  earned-pair rule: a CLI has no consumable API artifact). The
  distribution workflows follow the new build paths.
- **The dependency rule is now enforced.** dependency-cruiser runs in
  `pnpm lint` (and CI): the kernel imports nothing, the contract sees
  only the kernel, core never imports outward, infrastructure sees
  only kernel+contract and adapters never import each other, the CLI
  interface adapter can't touch core or infrastructure, and the
  composition-root exception is pinned to
  `application/cli/executable`. No import cycles anywhere.
- Per-layer `README.md` + `AGENTS.md` documenting each layer's
  purpose and local conventions.
- Typecheck (`pnpm typecheck`) now covers `tests/` as well as `src/`.

### Removed

- The dead `util/hash` module (no importers).

## [0.4.0-alpha] — 2026-06-10

### Added

- **Composition engine.** Replaces the v0.3 schematic-and-engine model
  with a capability-tag composition layer: predicate-driven adapters
  contribute files, patches, and deferred actions; verticals group
  adapters under a coverage requirement; the resolver hard-fails if
  any dimension is uncovered for the current tag set. See
  `src/composition/types.ts` for the contract.
- **`keel new --stack=<id>`.** Greenfield bootstrap from a stack
  preset. Today the only stack is `quarkus-cli` — a Quarkus 3 CLI on
  Gradle (Java 21) in a hexagonal layout — composing the `vcs` and
  `walking-skeleton` verticals.
- **`keel add <vertical>`.** Brownfield path: layer an additional
  vertical onto an already-initialised keel project. Today
  `distribution` is the headline use case; the add command refuses to
  run without a manifest, rejects unknown verticals with a list of
  available ones, and refuses to install the same vertical twice.
- **`walking-skeleton/quarkus-cli-bootstrap` adapter.** Emits a
  multi-module hexagonal Quarkus picocli skeleton: `domain/contract`,
  `domain/core`, and `infrastructure/cli`, with a `Mediator` interface,
  a sample `GreetCommand` + handler, a picocli subcommand, and a
  `QuarkusMainTest` that drives it end to end. Reads `basePackage` and
  `projectName` as sticky answers reused by downstream adapters.
- **`walking-skeleton/sample-port-fake` adapter.** Adds a sample
  `Clock` secondary port to `domain/contract` plus a `FakeClock`
  module under `infrastructure/clock/fake` with a contract test, and
  patches `settings.gradle.kts` to include the new module.
- **`walking-skeleton/gradle-wrapper` adapter.** Generates the Gradle
  Wrapper via the canonical `gradle wrapper` task as a deferred Action
  after the bootstrap files land — no checked-in jar. Requires
  `gradle` on PATH; surfaces a clear error otherwise.
- **`distribution` vertical with `quarkus-cli-native` adapter.** Ships
  GitHub Actions workflows that cross-compile the Quarkus CLI to
  native binaries via GraalVM and publish them to a GitHub Release on
  tag push. One sticky question selects the matrix targets
  (linux-amd64, linux-arm64, darwin-arm64). Promotes
  `runtime.graalvm-native` so future verticals can key off it.
- **Manifest v2.** Adds `tags`, `verticals`, `versions`, and `answers`
  alongside the v1 file-tracking entries. Reads are version-aware: a
  v1 manifest on disk migrates in memory on first read, and writes
  always emit v2.
- **`walking-skeleton/claude-core` adapter.** Emits the universal
  binding spec (`assets/project/CLAUDE.md`) into
  `<project>/.claude/CLAUDE.md` so every keel-scaffolded project
  carries the conventions Claude Code reads at session start. Covers
  a new `agentic-baseline` dimension on the walking-skeleton vertical,
  predicate empty so it fires unconditionally. Reads from the same
  canonical file contributors edit, so there's exactly one source of
  truth for the spec.
- **Walking-skeleton end-to-end test.** New
  `tests/composition/walking-skeleton-e2e.test.ts` drives `newProject`
  for the `quarkus-cli` stack into a temp directory, then runs
  `./gradlew build` (compile + tests) and the produced
  `quarkus-run.jar` against a sample `hello --name E2E` invocation,
  asserting the greeting reaches stdout. Per the brief, the only
  side effect that's faked is git: `vcs/git-init` is replaced with a
  no-op; every other deferred action runs for real. Each run uses a
  fresh `GRADLE_USER_HOME` so the scenario starts from a blank cache.
  Skipped automatically when `gradle` or `java` is missing from PATH,
  and on CI by default (the cold-cache Quarkus download is too heavy
  to run on every PR); opt out locally with `KEEL_SKIP_E2E=1`, opt in
  on CI with `KEEL_RUN_E2E=1`.

### Fixed

- **Walking-skeleton template now actually builds.** Bumped the
  `quarkus-cli-bootstrap` template's Quarkus version from `3.16.0`
  (which was never published to Maven Central — the 3.16 line jumped
  from `3.16.0.CR1` to `3.16.1`) to `3.34.6`, the latest stable in
  the 3.x line. The new version is also compatible with the Gradle
  9.4.1 wrapper the `gradle-wrapper` adapter pins, where 3.16's Gradle
  plugin tripped Gradle 9's stricter detached-configuration model.
- **JUnit Platform launcher on the test runtime classpath.** Gradle 9
  no longer auto-provides the platform launcher, so
  `useJUnitPlatform()` alone fails with "Failed to load JUnit
  Platform". The root `build.gradle.kts` template now adds
  `testRuntimeOnly("org.junit.platform:junit-platform-launcher")` to
  every subproject.
- **`gradle-wrapper` adapter surfaces the actual Gradle error.**
  Gradle prints task failures (`Test of distribution url ... failed`,
  `BUILD FAILED in Ns`, the stacktrace under `--stacktrace`) on
  stdout, not stderr. The previous `describeFailure` only captured
  stderr and fell back to `exit N`, leaving users with a context-free
  message when `gradle wrapper` failed. The adapter now joins both
  streams into the thrown error.

### Removed

- **Legacy schematics engine.** Every module that the v0.3
  schematic-and-engine path needed is gone: `src/schematics/` (whole
  directory: claude-core, claude-quarkus, walking-skeleton, port,
  scenario, gradle-wrapper, executable-rest, iac-cloudrun, ci-github,
  git-init, registry, util), `src/engine/types.ts`,
  `src/engine/homegrown.ts`, `src/engine/template.ts`, the
  `assets/schematics/` template tree, and the `'schematics'` asset
  kind. The composition engine fully replaces the surface.
- **Legacy CLI commands.** `keel install`, `keel update`, `keel
doctor`, and `keel generate` are removed; the CLI ends up with just
  `new` and `add`. The legacy installers
  (`src/installer/install.ts`, `update.ts`, `doctor.ts`, `plan.ts`,
  `profile.ts`, `env.ts`) are gone.
- **Legacy manifest store.** `src/manifest/schema.ts` and
  `src/manifest/store.ts` are gone. The v1 ManifestSchema and
  `MANIFEST_FILENAME` are inlined into `schema-v2.ts` solely to keep
  the migration path working.

## [0.3.0-alpha] — 2026-04-26

### Added

- **Context-aware install.** `keel install` is now a progressive,
  schematic-driven flow. On a greenfield workspace it asks **language →
  framework → native?**, runs an environment preflight, and composes
  the chosen schematics through the engine onto a single shared tree:
  `claude-core` (universal scaffold), `claude-<framework>` (stack
  runbook skills + CLAUDE.md addendum), and `walking-skeleton` (the
  thinnest end-to-end slice). The progressive picker is driven by a
  small profile registry (`src/installer/profile.ts`); adding a stack
  is a profile-only change.
- **`claude-core` schematic.** Renders the universal Claude scaffold
  (CLAUDE.md, settings, hooks, commands, agents, conventions) into
  `<project>/.claude/`. Runnable standalone via
  `keel generate claude-core`.
- **`claude-quarkus` schematic.** Renders five universal-verb runbook
  skills tailored to the stack — `build`, `test`, `run`, `format`,
  `troubleshoot` — and appends a sentinel-marked addendum to
  `CLAUDE.md` describing the project layout, default endpoints, and a
  quick command reference. Idempotent: a second run does not duplicate
  the addendum.
- **Environment preflight.** New `Env` port + `realEnv` adapter +
  `preflight()` driver. Universal check: `git` is required (fatal).
  Stack-gated checks for `java-quarkus`: a JDK on PATH at major ≥ 25
  (warning if missing or older — Gradle toolchains still bail out on
  first build), and — when native packaging is opted into — GraalVM's
  `native-image` (warning).
- **Runtime gradle-wrapper download.** `gradle-wrapper.jar` is fetched
  from `services.gradle.org/distributions/` at install time and
  verified against the published `.sha256` sidecar. The committed
  binary jar is gone from the repo. Dry-run uses a placeholder buffer
  so the planned-changes preview still shows the path without any
  network I/O.

### Changed

- **Default versions for the Java/Quarkus stack.** Gradle Wrapper
  default bumped from `8.11.1` → **`9.4.1`** (Java 25 toolchain
  support). Quarkus default bumped from `3.15.0` → **`3.33.1` LTS**
  (full Java 25 support). Version catalog refreshed: junit `5.13.4`,
  assertj `3.27.7`, archunit `1.4.2`, pitest (lib) `1.23.0`, nullaway
  `0.13.0`, spotless plugin `8.4.0`, pitest plugin `1.19.0`.
- **Asset layout.** The universal scaffold moved from
  `assets/project/` to `assets/schematics/claude-core/templates/` —
  it's now a regular schematic. `paths.asset('project')` is replaced
  by `paths.claudeCoreTemplates()` as the seam used by `install` and
  `update`. Manifest `source` prefix shifts from `project/<rel>` to
  `<schematic>/<rel>` (informational only — manifests carrying the
  legacy `project/` prefix continue to upgrade cleanly).
- **`update` orphan handling.** Files installed by stack-specific
  schematics (`claude-<stack>`, `walking-skeleton`) are tracked in
  the manifest but live outside `claudeCoreTemplates()`. `update`
  now preserves their entries verbatim instead of treating them as
  orphans and deleting them on the next run.
- **`sha256Shipped` records the first-writer content.** For files
  composed by multiple schematics (e.g. `CLAUDE.md` = claude-core +
  claude-quarkus addendum), `sha256Shipped` is the first writer's
  content and `sha256Current` is the final composed content. The gap
  signals "non-trivial composition" to `update`, which then routes
  the file through the user-modified-conflict path instead of
  silently overwriting and dropping the addendum.

### Removed

- **Methodology-only skills.** The seven skills that only restated
  conventions already present in `CLAUDE.md` are gone:
  `hexagonal-review`, `mediator-pattern`, `trunk-based-xp`,
  `public-api-docs`, `test-scenario-pattern`, `walking-skeleton-guide`,
  `iac-opentofu`. The binding-spec content stays in CLAUDE.md;
  actionable skills now live alongside each stack profile.
- **Committed `gradle-wrapper.jar`.** The binary is no longer checked
  in; it is fetched and verified at install time.

### Notes

- `keel install` now refuses to operate on a directory containing
  anything beyond `.git` (override with `--force`). Brownfield-aware
  install support is on the roadmap.

## [0.2.0-alpha] — 2026-04-25

### Removed

- **Global install scope.** The `--global` flag is gone from
  `keel install` and `keel update`, and `keel doctor` no longer audits
  `~/.claude`. keel is now **project-scoped only**: the entire kit
  (CLAUDE.md, skills, agents, slash commands, hooks, settings) installs
  into `<project>/.claude/`, and the user's home directory is never
  read, written, or otherwise touched. This is a breaking change for
  anyone running `keel install --global` — the command now fails with
  an unknown-option error. Existing `~/.claude/` installs are left
  alone (no cleanup is performed); to migrate, run `keel install` in
  each project that should have keel and remove the now-orphaned
  `~/.claude/` files manually if desired.

### Changed

- **`assets/global/` and `assets/conventions/` collapsed into
  `assets/project/`.** The packaged asset tree no longer distinguishes
  scopes: `CLAUDE.md`, `agents/`, `commands/`, and `skills/` moved from
  `assets/global/` to `assets/project/`; the permissions / env block
  from `assets/global/settings.json` was merged into
  `assets/project/settings.json` alongside the existing hooks; and
  `assets/conventions/languages.json` (the per-language toolchain
  matrix consulted by hooks, agents, and slash commands) moved to
  `assets/project/conventions/`. Consumers see the merged bundle land
  in `<project>/.claude/`. Shipped agents and commands now reference
  `.claude/conventions/languages.json` instead of the keel-repo path
  `assets/conventions/languages.json`, which fixes a broken reference
  for consumer projects.
- **`doctor` foreign-file scan.** `conventions/` is now a managed
  directory; foreign files dropped there are flagged.
- **Manifest schema.** The `scope` field is removed from the schema (no
  longer typed, no longer written). Old manifests that still carry a
  `scope` key continue to parse — Zod silently strips unknown keys —
  but the value is ignored everywhere.
- **CLI help text** updated to describe the project-only behavior; the
  `keel doctor` summary line now reports a single audit instead of one
  per scope.
- **README rewritten.** New sections: _Why keel_, _Quickstart_,
  _CLI_ (full command table with flags and behavior), _What ships in
  the kit_, _Customizing your install_. Drops every reference to
  `--global`.
- **Root `CLAUDE.md`** updated: §1 points the binding spec at
  `assets/project/CLAUDE.md`; §6 layout shows a single `assets/project/`
  bundle; §7 testing reference relinked.

### Added

- `LICENSE` file at the repository root (MIT, © 2026 Romain Goussu).
  The package was already declared MIT in `package.json` but lacked a
  root license file.
- `THIRD_PARTY_LICENSES/` scaffolding for tracking derived work:
  `citypaul-dotfiles.LICENSE` (verbatim upstream license),
  `citypaul-dotfiles.NOTICE.md` (audit trail of imported artifacts
  pinned to upstream commit `a4b6c469`), and `HEADER_TEMPLATE.md`
  (per-file provenance header templates for Markdown, shell,
  TypeScript, PowerShell, and JSON sidecars).
- `README.md`: `Acknowledgments` section pointing to the
  `THIRD_PARTY_LICENSES/` audit trail.
- Four specialised agents under `assets/project/agents/`, adapted from
  citypaul/.dotfiles (MIT, © 2024 Paul Hammond) at upstream commit
  `a4b6c469`: `tdd-guardian`, `pr-reviewer`, `learn`, `adr`. Each file
  carries a provenance header listing the substantive deltas; the
  audit trail is in
  `THIRD_PARTY_LICENSES/citypaul-dotfiles.NOTICE.md`. Distributed to
  `<project>/.claude/agents/` by `keel install` (no installer change
  required; the planner walks `assets/project/` recursively).
- Three new skills extracted from the binding spec, each with TRIGGER /
  SKIP guidance for Claude Code's on-demand loading:
  - `mediator-pattern`: Action/Command/Query/Result kernel, mediator
    construction rules, sealed error hierarchies, transport mapping.
  - `iac-opentofu`: OpenTofu rules, walking-skeleton checkpoint,
    container-registry choice, anti-patterns.
  - `trunk-based-xp`: workflow, commit discipline, the "done"
    checklist.
- GitHub MCP permissions in `assets/project/settings.json`: read tools
  (`mcp__github__pull_request_read`,
  `mcp__github__list_pull_requests`,
  `mcp__github__get_file_contents`,
  `mcp__github__subscribe_pr_activity`, etc.) are pre-allowed; write
  tools (`mcp__github__pull_request_review_write`,
  `mcp__github__add_issue_comment`, `mcp__github__create_pull_request`,
  `mcp__github__merge_pull_request`, etc.) are ask-listed. Same
  read-vs-write split as the existing git permissions.

- **Domain split refined into a three-module DAG**:
  `domain/kernel ← domain/contract ← domain/core`. Builds on the
  kernel-relocation work in #6 (which had grouped everything in
  `domain/contract/kernel/`) by extracting the higher abstractions —
  sealed `Action` / `Command` / `Query` / `Result` / `Error` bases plus
  the `Handler` and `Mediator` interfaces — into a dedicated
  `:domain:kernel` Gradle module. The concrete `Command` / `Query` /
  `Error` subtypes that name each supported operation stay in
  `domain/contract` (the system's public surface). The Mediator
  implementation (`RegistryMediator`) and the handlers live in
  `domain/core`. Adapters
  (`application/<channel>/contract`, `infrastructure/<port>/*`)
  depend on `domain/kernel` and `domain/contract`; the composition
  root (`application/<channel>/executable`) keeps its cross-layer
  wiring exception introduced in #6. CLAUDE.md §1 + §2,
  `hexagonal-review` skill, `mediator-pattern` skill,
  `walking-skeleton-guide` skill, and `pr-reviewer` agent updated to
  match.
- **Walking-skeleton schematic ships the new module structure**: the
  Java template scaffolds `:domain:kernel`, `:domain:contract`,
  `:domain:core` as separate Gradle modules. `Mediator` becomes an
  interface in `domain/kernel/`; `RegistryMediator` (default impl
  built from `Collection<Handler<?>>`) lives in `domain/core/`.
  `settings.gradle.kts` includes `:domain:kernel` ahead of
  `:domain:contract`. `domain/contract/build.gradle.kts` declares
  `implementation(project(":domain:kernel"))`;
  `domain/core/build.gradle.kts` adds `:domain:kernel` alongside the
  existing `:domain:contract`. The walking-skeleton test asserts the
  new file layout, the interface/impl split, and the new include.
- **`executable-rest` schematic adapted to the three-module split**:
  `application/rest/contract/build.gradle.kts` and
  `application/rest/executable/build.gradle.kts` now also depend on
  `:domain:kernel`. `MediatorProducer.java.ejs` constructs
  `RegistryMediator` (the impl) and exposes it via the `Mediator`
  interface.
- **`iac-opentofu` skill aligned with `/iac/<target>/`**: the skill
  now describes IaC modules at the repo root (`/iac/cloudrun/`,
  `/iac/hetzner/`, etc.) instead of `infrastructure/iac/`, matching
  #6's IaC-relocation; container-registry section added per the same.
- **`assets/project/CLAUDE.md` trimmed from 214 to ~150 lines** (file
  was at `assets/global/CLAUDE.md` before the global-scope removal):
  each
  major section keeps a 2–4 line summary and points to its skill
  (`§1` → `hexagonal-review`, `§2` → `mediator-pattern`, `§3` →
  `test-scenario-pattern`, `§4` → `walking-skeleton-guide`, `§5` →
  `iac-opentofu`, `§6` → `trunk-based-xp`, `§8` → `public-api-docs`).
  `§7 Principles` and `§9 Claude behavior` (always-loaded) stay in
  the core. The on-demand-skills pattern is inspired by
  `citypaul/.dotfiles` (see `THIRD_PARTY_LICENSES/`).

### Fixed

- `package.json` `files` list now ships `LICENSE` and
  `THIRD_PARTY_LICENSES/` on `npm publish`, so consumers receive the
  audit trail and upstream permission notices the README points at.
- `THIRD_PARTY_LICENSES/HEADER_TEMPLATE.md` no longer hard-codes
  `© 2026 Romain Goussu, MIT.` in the modifier-copyright line; the
  year, holder, and license are now `<YYYY>` / `<holder>` /
  `<license>` placeholders documented under "Required fields", with
  a default pointing at the repo `LICENSE`.
- `THIRD_PARTY_LICENSES/HEADER_TEMPLATE.md` PowerShell template
  snippet uses an em dash (`MIT — see ...`) like the other templates
  instead of a hyphen.
- `trunk-based-xp` skill no longer claims "no branches / no pull
  requests" without acknowledging the keel-repo cloud-session
  exception for both. Each rule explicitly scopes to consumer
  projects and links to the keel repo root `CLAUDE.md`, §2 and §4
  for the exception.
- `pr-reviewer` agent's "Quality gates" section no longer references
  the stale `assets/global/CLAUDE.md §6.2`. It now points at the
  `trunk-based-xp` skill's "Done means" section, which is the live
  source of those checks since the binding spec was trimmed.

## [0.1.0-alpha.2] — 2026-04-19

### Added

- `CI` workflow (`.github/workflows/ci.yml`): lint, typecheck, test, build on
  every pull request and push to `main`, matrixed across Node 20 and 22 with
  pnpm 9 and a pnpm cache.
- `Release` workflow (`.github/workflows/release.yml`): on `v*` tag push,
  verifies the tag matches `package.json`, reruns the full verify pipeline,
  publishes to npm with `--provenance --access public`, and creates a GitHub
  Release with auto-generated notes.
- npm dist-tag is derived from the semver prerelease identifier (`alpha` →
  `alpha`, `beta` → `beta`, `rc` → `next`, none → `latest`); unknown
  prerelease identifiers fail the release.
- `CLAUDE.md` at the project root documenting repo-specific engineering and
  workflow conventions, including the PR auto-subscribe preference for
  cloud-hosted Claude sessions.
- `.github/dependabot.yml`: weekly grouped updates for `github-actions`.
- README: CI/Release badges, `Development` section, `Release process`
  section.
- `.prettierignore` so generated files (lockfile, `dist/`, schematic
  templates, manifests) are excluded from the prettier check.
- Claude `PreToolUse` hook (`.claude/hooks/pre-commit-format.sh`) that
  auto-formats and re-stages before every `git commit`, and blocks the
  commit if lint still fails after formatting.
- `format:check` npm script that runs `prettier --check .`.

### Changed

- `pnpm lint` now also runs `prettier --check .` after eslint, so
  formatting drift fails the same gate as code-style rules.

### Security

- Pinned every GitHub Action in CI and release workflows to a full commit
  SHA with a `# vX.Y.Z` comment (`actions/checkout`, `actions/setup-node`,
  `pnpm/action-setup`, `softprops/action-gh-release`) so upstream changes
  cannot reach the publishing pipeline without review.

## [0.1.0-alpha.1] — 2026-04-19

First cut of the kit. Installs globally (user-wide defaults) and per-project
(hooks, per-repo settings). Copy-based install with manifest tracking and
three-way update reconciliation. Homegrown schematics engine behind a
swappable `Engine` / `Schematic` / `Tree` / `Context` port interface.

### CLI

- `keel install [--global] [--force] [--dry-run]`
- `keel update  [--global] [--dry-run] [--yes]` — three-way merge, prompts on conflict
- `keel doctor` — audit both scopes for drift
- `keel generate <schematic> [--dry-run] [--set k=v...]` (alias `g`)

### Global assets (`~/.claude/`)

- `CLAUDE.md` encoding: hexagonal architecture, Command/Query + Mediator,
  DIP-strict tests (Scenario + Factory + fakes), walking skeleton first,
  IaC via OpenTofu, trunk-based + XP + SOLID + 12-Factor, public-API-docs
  policy, always-latest-stable rule, terse Claude behaviour.
- `settings.json` with pre-allowed toolchain (Gradle, pnpm, Cargo, Go,
  OpenTofu, rg/fd/tree) + ask-list (push/reset/rebase) + deny-list
  (force-push, reset --hard, sudo).
- Skills: `hexagonal-review`, `test-scenario-pattern`, `public-api-docs`,
  `walking-skeleton-guide` — language-agnostic, same principle across
  Java / Kotlin / TypeScript / Rust / Go.
- Slash commands: `/commit`, `/sync`, `/diff-review`, `/docs-check`.

### Project assets (`<project>/.claude/`)

- Hooks (`.sh` + `.ps1` pair each, platform-scoped in settings):
  - `PostToolUse` format-on-edit (spotless, prettier, rustfmt, gofmt, tofu fmt)
  - `PreToolUse` pre-commit-verify (gradle check, pnpm typecheck+test, cargo,
    go vet+test)
  - `SessionStart` context load (branch, dirty count, recent commits,
    walking-skeleton markers)
  - `Stop` commit-discipline reminder

### Conventions table

- `assets/conventions/languages.json` — per-language formatter, linter,
  typecheck, test, mutation, doc format. Single source of truth for all
  hooks / commands / schematics.

### Schematics (Java proving ground)

- `port` — secondary port + fake module + contract test (4 files).
- `scenario` — Scenario + Factory + Test triad in the domain test tree.
- `walking-skeleton` — multi-module Gradle shell + build-logic convention
  plugins + kernel (Action / Command / Query / Result / Error / Handler /
  Mediator / DuplicateHandlerException / NoHandlerError) + IaC stub +
  composes `port` for a starter secondary port (27 files).

### Not yet shipped (roadmap)

- `executable` schematic — chooses web / messaging framework at
  walking-skeleton time; wires an `application/<channel>/executable`.
- `handler` schematic — Action + Handler + wiring.
- `adapter` schematic — real adapter for an existing port.
- Additional language templates (Kotlin, TypeScript, Rust, Go).
- Adapter packages for alternative schematics engines (Plop, Nx).
- Migration runner for `keel update` (scripts exist as a concept but are
  not yet executed).

[Unreleased]: https://github.com/rgoussu-dev/Keel/compare/v0.5.0-alpha...HEAD
[0.5.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.4.0-alpha...v0.5.0-alpha
[0.4.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.3.0-alpha...v0.4.0-alpha
[0.3.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.2.0-alpha...v0.3.0-alpha
[0.2.0-alpha]: https://github.com/rgoussu-dev/Keel/compare/v0.1.0-alpha.2...v0.2.0-alpha
[0.1.0-alpha.2]: https://github.com/rgoussu-dev/Keel/compare/v0.1.0-alpha.1...v0.1.0-alpha.2
[0.1.0-alpha.1]: https://github.com/rgoussu-dev/Keel/releases/tag/v0.1.0-alpha.1
