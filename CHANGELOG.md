# Changelog

All notable changes to `@rgoussu.dev/keel` are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

This file deliberately deviates from Keep a Changelog 1.1.0 in one
way: released sections live one file per release under
[`docs/releases/`](docs/releases/) — the split Kubernetes and Node.js
use to keep a long-lived changelog scannable — and the root keeps
`[Unreleased]` plus the release index below.

## [Unreleased]

### Fixed

- **A dev container you customized is refused, not crashed on, when a
  dev environment arrives.** `keel add dev-env` on a project whose
  `.devcontainer/devcontainer.json` no longer carried the image keel
  scaffolded — a base image of your own — threw a plain error naming
  the manual recipe: the terminal printed it, and `keel ui` answered the
  preview with `keel.internal`, as a bug to report. It is now refused as
  `keel.path-conflict` before anything is written, as any file keel
  cannot patch is, saying the file changed since keel scaffolded it
  and that attaching it to the dev environment is yours to do — never
  the `"image"` line the attach replaces, since putting it back would
  leave your image beside the compose fields, where it is ignored;
  `docs/verticals/dev-container.md` has the recipe.

- **The manifest records a harness file as keel leaves it.** Each file
  the agent harness writes has a record in `.keel-manifest.json`'s
  `entries`, whose hashes say what keel shipped. The family kit's
  `.claude/hooks/pre-commit-format.sh` was recorded as it was staged,
  before code-style wrote its format step into it, so on every JVM,
  Rust and TypeScript project its record named bytes the file never
  held. And keel's own later write went unrecorded: `keel add
persistence`, putting its section in a directory document the kit
  seeds, such as `internal/infra/AGENTS.md` on a basic Go project,
  left the earlier record's shipped hash as it was, and `keel add
module` recorded the root `AGENTS.md` before adding the new
  context's row to its map. Either read as an edit of yours, and
  persistence in one run or in two recorded different manifests.
  `keel new` and `keel add` now record each harness file they write
  as they leave it, as shipped and as current — an edit of yours
  already in it included. Nothing in keel reads these hashes yet, and
  no project file changes.

- **`--reapply` no longer adds a second monitoring section to a CRLF
  README.** On a README with CRLF line endings — one cloned on Windows
  under `core.autocrlf` — `keel add observability --reapply` on an HTTP
  project did not find its `### Monitoring stack` section and added it
  again at the end. That section was written in LF, and the dev
  container's patch, which runs after it, rewrote it in CRLF, where the
  monitoring stack's check looked for it in LF alone. The section now
  comes in the README's own line endings, and a reapply finds it.

- **Persistence installs beside the peer context.** On the modulith
  with the peer context — `keel new --module-layout modulith
--with-peer-context --with persistence`, or `keel add persistence` on
  such a project — `micronaut-rest`, `micronaut-cli-rest`, their Kotlin
  twins, `ts-http` and `ts-cli-http` crashed, with either build system,
  and `keel ui`, which offers persistence there, answered its preview
  with `keel.internal`; `keel add persistence` after a `keel add
module` on those stacks crashed alike. Persistence wired its handlers
  into the composition root by matching the line the walking skeleton
  wrote, and the other context had rewritten it. It now reads the list
  it finds — `@Import(packages = …)` on Micronaut Java, the hand-wired
  `mediator(…)` on Kotlin, `createRegistryMediator([…])` in `main.ts` —
  and adds the greeting log's entries after the contexts already there,
  so the root registers both, in one run or two. On the TypeScript
  stacks, `keel add module` after persistence spliced the new context's
  handler in after persistence's trailing comma, leaving a hole in that
  array, and the project no longer typechecked — as it did after a
  comment ending any such array; the handler now follows the array's
  last entry, on a line of its own after a trailing comma, and a
  comment there stays where it is. A root rewritten so that it no
  longer holds the list, or edited so that keel cannot read it back as
  one — a comment among its entries, a Kotlin mediator given a block
  body — or a `server.ts`, Micronaut controller test or root `pom.xml`
  missing what persistence patches inside, crashed the same way; each
  is now refused as `keel.path-conflict` before anything is written,
  naming the file and what it lacks — _'…/MediatorFactory.java' has no
  '@Import(packages = …)' list holding only package names — keel adds
  its lines inside it and does not rewrite the file; add one, then
  re-run_ — as `keel add module` over such a root on Micronaut now is,
  where it used to
  rewrite a list with a comment in it, or a block-bodied mediator, into
  source that no longer compiled, and split a handler taking a string
  with a comma in it (`Echo("a, b")`) in two; what is inside a string is
  now the string's. So, on Micronaut Kotlin, is a context named for a
  port the mediator already takes, in either order —
  _'…/MediatorFactory.kt' already has a 'clock' where keel adds one
  of that name — keel renames neither, and the two would not build;
  rename the one there, then re-run_: `keel add module clock` after
  persistence, which takes its `Clock` under that name, used to be
  wired in as a second `clock` parameter, as `welcome` after the peer
  context was, and the root no longer compiled.

- **`keel new` inside a keel project is refused up front.** Run in a
  directory under a keel project that holds no project of its own —
  `my-app/tools/`, `my-app/tools/scripts/`, or a directory inside one
  of a monorepo product's services — `keel new` scaffolded a second
  project there, its own repository, hooks and harness inside the
  first's; in a directory keel wrote a `CLAUDE.md` into, such as
  `my-app/domain/`, it was refused over that file, as one in the way
  (`keel.path-conflict`); and a directory deeper inside a monorepo
  product than any of its services, such as `my-product/docs/notes/`,
  was not found to be inside the product at all. Each is now refused
  before anything is asked, naming the nearest project above it, even
  one whose manifest keel cannot read: as `keel.inside-project` —
  _this directory is inside the keel project at ../; scaffolding a
  project inside another is not supported — scaffold it elsewhere and
  move it here_ — or, where a monorepo product root lists no service,
  `keel.inside-product`. `keel ui`'s preview there is refused alike,
  and the page shows it where the plan would be. `keel add` there names
  the same project — under one whose manifest keel cannot read, it
  said to run `keel new` first — and neither looks into your home
  directory: a `~/.claude/.keel-manifest.json` left by 0.1.0-alpha's
  `keel install --global` is no project. A directory holding a
  manifest is one of its own, whatever holds it, and is refused before
  anything is asked as well: as `keel.already-initialised`, which a run
  with no `--stack` in a project's own directory said only after the
  whole stack drill-down, or, where keel cannot read the manifest, with
  the broken file reported, as anywhere. Inside a monorepo product, a
  project moved into a directory directly under the root that the
  product does not list, and a manifest keel could not read there or
  in a listed service, were `keel.inside-product`.

- **A refusal names the stack that comes with what you asked for, and
  the service that can take it.** `keel new --stack=quarkus-cli --with
observability` was refused with the hint _"…, or scaffold
  quarkus-cli-rest, which carries it: 'keel new
  --stack=quarkus-cli-rest --with observability'"_ — a `--with` that
  preset only sets aside, since observability comes with it. The hint
  now reads _"…, which comes with it: 'keel new
  --stack=quarkus-cli-rest'"_, and `keel add observability` on the
  scaffolded project _"quarkus-cli-rest has this project's
  entrypoints and comes with observability"_; the refusal records it
  (`comesWith`, beside `carriedBy`), and its sentence is unchanged. A
  vertical one service of a product cannot carry was refused as if the
  service were a project alone — `keel new --stack=fullstack --with
frontend:persistence` said _"Persistence has no adapter for this
  project's stack"_, the hint only _"drop 'frontend:persistence' from
  --with"_. The sentence now names another service that can take it,
  or has it — _"…; backend/ can take it"_, _"…; backend/ has it
  already"_ — and the hint the pair to type instead: _"…, or name
  backend/: '--with backend:persistence'"_. `keel ui`'s per-service
  _Not for frontend/_ says the same, as do `keel add` in a monorepo
  product's service and its card; the refusal carries the product's
  other services (`elsewhere`), and its code is unchanged. A pair named
  for two services, one of them refused (`--with
frontend:persistence,backend:persistence`), was hinted to drop by the
  bare id, _"drop 'persistence' from --with"_; it is now spelled for
  the one refused, _"drop 'frontend:persistence' from --with"_.

- **A product root from an older harness generation no longer points
  at a command it refuses.** At a monorepo product root whose manifest
  carries an older harness-generation marker, or none, every `keel add`
  the root did not refuse for its scope first — `keel add
agent-harness` included — `keel add module` and `keel docs` said to
  move the harness aside and run `keel add agent-harness`, which is
  refused there in the same words, and `keel add --list` and `keel ui`
  said every add but that one was refused. A product root's harness is
  the product's own, and no `keel add` brings it forward: the refusal
  now says so, and names the way forward that works — for what the
  root runs itself, pinning the keel that scaffolded it; for what is
  there already — its services', `keel add agent-harness` among it, or
  the root's own, not re-rendered — who has it, with nothing to run
  there. `keel add module` is refused as at any
  product root (`keel.invalid-module`), as the status says, and
  `keel add --list`'s line and the page's notice say which refusal
  each add there meets.

- **`keel add module`, `keel link` and `keel toolchain` inside a
  project name it.** Run in a directory under a keel project that holds
  none of its own, each said to run `keel new` first, which is refused
  there (`keel.inside-project`). Each now points at the project above —
  _"this directory is inside the keel project at ../; run 'keel add
  module' there"_ — or at a polyrepo product's services below, as
  `keel add` does; inside a monorepo product root, which takes no
  bounded context and declares no toolchain, `keel add module` and
  `keel toolchain` name its services instead. Where every project it
  would name takes no bounded context either — the flat layout,
  scaffolds' default — `keel add module` says so, and why, rather than
  sending you there to be refused: _"…inside the keel project at ../,
  which refuses 'keel add module' too, since a bounded context needs
  the modulith layout: …"_. `keel.project-status` there reports the
  same sentence as its `moduleRefusal`. Where no project is near, each
  still names `keel new`, now ending _"first to create one"_ as `keel
add`'s sentence does. And at a monorepo product root itself, `keel
toolchain install|check` said to run `keel add toolchain` first,
  which is refused there (`keel.wrong-scope`); it now names the
  services, where a toolchain goes — _"this is a product root, which
  declares no toolchain: a toolchain belongs to a service — run 'keel
  toolchain install' in backend/ or frontend/"_ — under the same code,
  `keel.toolchain-not-declared`.

- **`keel new` no longer merges into a file of yours that it patches.**
  Into a directory that was not empty, a file keel writes through a
  patch rather than whole was merged with the one already there:
  `package.json` on the TypeScript stacks, `settings.gradle.kts` on the
  Gradle ones, and `.gitattributes`, `.editorconfig`, `AGENTS.md` and
  `.claude/settings.json` on nearly every stack. The run exited 0 and
  left a broken scaffold — a `package.json` of your own kept its name
  and lost keel's workspaces and scripts (`npm run test`: _Missing
  script_), a `settings.gradle.kts` lost the foojay plugin and the
  `domain` modules. Each is now refused as `keel.path-conflict`,
  naming it, as a file keel writes whole already was: `README.md` and
  `.gitignore` are the only files `keel new` adopts, as `docs/cli.md`
  says. Nothing is written before the refusal.

- **`keel add` where no project is says where one is.** Run in a
  subdirectory of a keel project, or in a polyrepo product's directory
  (which has no manifest of its own), `keel add` said _run 'keel new
  --stack=<id>' first_ — advice that scaffolds a project inside
  another, or over the product's services. It now names the project
  above (_this directory is inside the keel project at ../; run 'keel
  add' there_) or the services below (_backend/ and frontend/ below
  hold keel projects; run 'keel add' in one of them_), still as
  `keel.not-initialised`.

- **`keel new` in a clone no longer says there is no remote.** With
  no remote answered, the git step logged _no remote configured. Add
  one later with `git remote add origin <url>`_ in a clone whose
  `origin` was already set, where that command fails. It now says the
  origin is there.

- **`keel ui` stays on the directory you moved to last.** The page
  pointed itself at a directory before reading it, and adopted
  whatever came back: a slow status read for one directory, landing
  after a move to another, put the first project's cards over the
  second's path, and a Generate still running when you moved on
  opened its report over the page you had moved to. A directory that
  could not be read kept the previous project's cards, and a tick there
  posted them to the new path. Each move now supersedes the reads of
  the last, an install that lands after a move leaves the page alone,
  and a directory that cannot be read shows why on the Directory step
  with nothing of the previous project left to post.

- **The review of an add says what you answered.** A keel project's
  review listed what the run adds but not the answers it posts —
  `migrations=liquibase` for a ticked Persistence went out on Generate
  with no row saying so. Its _Questions_ row counts them, as a new
  project's does.

- **Changing the preset or a text answer from the keyboard keeps the
  focus.** ArrowDown in the preset picker, or Tab out of a text answer
  on the Questions step, rebuilt the control mid-move and dropped the
  focus on the page body. The picker is built once and updated in
  place, and an answer no longer rebuilds the list it was typed in.

- **Two scopes of a product writing one file are refused, not
  silently overwritten.** A composite product stages its root and
  each service into trees of their own, so a file two of them wrote —
  a preset installing an image in a monorepo service whose Dockerfile
  the product root already writes — was listed twice in the plan, and
  on install the scope committed last silently replaced the other's.
  `keel new` now refuses it before the plan is reported
  (`keel.cross-scope-write`), naming the file and both adapters with
  where each runs — _backend/.dockerignore would be written by two
  scopes of this product — by fullstack/product-compose at the product
  root, and by containerization/quarkus-rest-image in backend/ — …_ —
  so `--dry-run`, the `keel ui` preview and the install refuse it
  alike. No shipped product does this; a preset or a plugin's product
  could.

- **`keel new --no-agent-harness` no longer installs the harness as a
  prerequisite.** A `--with` vertical that needs the agent harness —
  a plugin's; keel ships none — was planned with its prerequisites, so
  the harness the flag left out came back unasked. It is now refused
  as one that switches the harness back on
  (`keel.invalid-agent-harness`), and the interactive extras question
  leaves it off its menu.

- **Moving to another preset in `keel ui` keeps your extras and
  answers too.** The "Also scaffold" extras and the answers to the
  adapters' questions were still thrown away on every preset move: a
  pipeline ticked and a package typed on `quarkus-cli` were gone the
  moment HTTP was ticked. The extras now carry over like the dials,
  `keel.dials` drops what the new preset cannot carry, and the line
  under the Preset picker names each one with the reason it gave —
  _Container image dropped: it needs an entrypoint this project does
  not have: HTTP server — a REST endpoint._ — but not one
  the new preset comes with, which it keeps. The answers are held until
  the new preset's first preview has reported its questions, then
  placed wherever the same question is asked and still offers the
  value, and previewed again; an answer about the project's identity
  (`shared: "project"`: its name, package, module path or npm scope)
  moves onto the new bootstrap's question of the same id, so the
  package survives ticking HTTP on and the name survives a move to Go.
  A choice the new preset does not offer — MariaDB, moved to Go — is
  let go rather than posted into a `keel.invalid-answer` the page had
  no question on screen to fix.

- **`keel ui` previews an answer as the install writes it.** An answer
  keyed to a bootstrap's sibling — a Quarkus REST bootstrap's package
  on `quarkus-cli-rest`, whose CLI bootstrap asks first, or on
  `quarkus-rest` a CLI bootstrap's — previewed as the default
  (`com/example`) and was installed as given (`org/acme`). The preview
  now reads the answers it is sent by the install's own precedence —
  the adapter's own id, then each sibling it shares the question with,
  in the order it lists them — and binds the question to the id the
  answer came under, so the page keeps it and posts it back. The
  composition grid holds every preset to it: one body, previewed and
  installed as a dry run, stages the same bytes (I9).

- **Two answers to one shared question no longer split the project.**
  With `--set` for both bootstraps of a two-entrypoint project, or for
  both the `ci` and the `distribution` provider, each adapter took its
  own — two packages in one Gradle build, two providers in one
  repository — and `keel add distribution` with its own provider took
  it over the one `ci` recorded. An adapter now reads what the project
  records before what is supplied, so a question one sibling settled
  is settled for the other, and a second, different answer is refused
  (below).

- **A project another keel wrote reads its own identity.** A manifest
  an older keel seeded with every answer supplied to `keel new` —
  another family's bootstrap's included — gave the readers that took
  the first bootstrap in a list with answers the wrong package: the
  sample port, a bounded context `keel add module` adds, a Quarkus
  CLI's native build and the deploy descriptors' project name. Each
  now reads the bootstrap the project's tags say it ran.

- **A monorepo product's service is part of one repository, and keel
  now reads it as one.** Inside `backend/` of a monorepo product,
  `keel add containerization` met the Dockerfile the product root had
  already written there (`keel.path-conflict`), and so did
  `distribution` and `iac`, which bring it along; `keel add ci` and
  `keel add distribution` wrote workflows under `backend/.github/`,
  where no provider reads them; and `keel add vcs` would initialise a
  second git repository inside the first. What the product gives a
  service is now there already — adding `vcs` or `containerization`
  in it is an Ok that writes nothing, its note saying the product root
  has it or builds it — and what only a
  repository root reads is refused there under `keel.wrong-scope`, in
  the vertical's own words: _"Continuous integration cannot go in a
  monorepo service: its pipeline is read only at the repository root,
  which in a monorepo is the product root — per-service pipelines need
  the polyrepo layout"_; `iac` reads as needing Distribution, which
  cannot go there. `keel.project-status`, `keel add --list` and
  `keel ui` say so before the click. A `--reapply` or a `--refresh` of
  either says the same, rather than advising an install there: what
  the product gives is not the service's to re-render
  (`keel.vertical-not-installed`, saying where it comes from), and
  what only a repository root reads is `keel.wrong-scope`. A polyrepo product's services are
  repositories of their own and are unchanged. At a product root,
  `gateway` is answered from the services, which have it, like every
  other vertical the root cannot carry, rather than refused as needing
  an HTTP entrypoint.

- **A plugin's rule binds what comes after its piece.** A `Conflict`
  was read, on a project already on disk, only for the vertical being
  added and only against the tags the manifest recorded — so a rule an
  installed vertical declares, broken by a newcomer's tags, went
  unread, and so did any rule broken by a tag a vertical promotes as it
  installs, in `keel new` too. Every rule of the pieces coming together
  now holds over every tag the run would add: such a vertical is
  unavailable on the project's card and refused by `keel add` and
  `keel new --with` alike, in the rule's own sentence
  (`keel.incompatible`), and the install loop holds the rules again
  after each vertical, before anything is written. No shipped rule is
  of that kind.

- **`keel ui`'s extras are a control that stays.** They were a
  question the preview asked, and the install stops asking a question
  once it is answered — so the list vanished after the first tick: one
  extra at most, never unticked. The Options step now has an _Also
  scaffold_ group in four parts: _Ready_; _Needs another capability
  first_, each card naming what it needs by title — ticking one ticks
  those too, and unticking one unticks every vertical that needs it,
  so ticking Infrastructure as code posts
  `containerization,distribution,iac` and unticking Container image
  takes all three back; _Comes with_ the preset, as chips; and _Not
  for this project_, collapsed, each with its reason. Every
  single-service preset has the step, so the rail no longer grows one
  when the first preview lands. The review lists the extras with a
  link back to them, and its _Questions_ row counts the answers you
  set rather than every question asked; Generate waits for the
  preview of the run as it now stands, so an answer an unticked extra
  took with it is never posted; and the command line under the plan
  is set back while the run is refused, saying the terminal would
  refuse it too, its text still at full contrast.

- **Distribution and infrastructure as code are offered where they can
  be built, and nowhere else.** `distribution`'s need for the image
  `containerization` builds was a check inside its adapter, which no
  menu could see: `keel ui` and the `keel new` wizard offered
  distribution on every HTTP stack and refused it on install, never
  offered `iac` at all, and `keel.dials` silently dropped an `iac` the
  command line would have accepted. The requirement is now declared in
  each container adapter's predicate, and every surface reads it from
  one planner: the extras menu offers distribution as _needs Container
  image_ and iac as _needs Container image, Distribution_ — labelled
  so in the wizard; ticked for you in `keel ui` — and `keel new
--with` and `keel add` install what one leaves out with it, first,
  saying so in the plan's first note (_"added Container image,
  Distribution — needed by Infrastructure as code"_). `iac` on a CLI
  project is refused for the HTTP entrypoint it lacks rather than for
  a tag. On `quarkus-cli-rest` on Gradle, distribution alone now
  installs its native binaries instead of being refused.

- **The service gateway is refused where no project is linked.** With
  no peer, `gateway` installed zero files and was recorded as
  installed — which then blocked the real install after `keel link`.
  It is no longer offered there — listed as not for this project
  instead — and `keel add gateway` refuses it: _"Service gateway wires linked projects, and no
  linked project serves it here — link one that does first"_, with
  `keel link <path>` as the terminal's hint.

- **A file in the way, or gone, is a refusal naming it.** `keel new`
  into a directory holding a file it writes crashed — a freshly cloned
  hosted repository's `README.md` or `.gitignore` did, on the Go,
  Rust, `web-components` and composite stacks, and `keel new` now
  adopts those two instead (under Changed). So did
  `keel add containerization` or `keel add ci` over your own
  `Dockerfile` or `.github/workflows/ci.yml`. `keel ui` answered each
  with a 500 whose sentence was meant for an adapter's author
  (_"use a patch to modify existing files"_).
  Each is now refused as `keel.path-conflict`, naming the file — from
  where the command ran, so a file in a composite product's service is
  `backend/go.mod` — in one sentence for both commands; under `keel
new` the terminal adds the way past it (move it aside, or start in
  an empty directory), which under `keel add` it cannot stand behind,
  since there the file may be keel's own. A JVM build file with no
  `plugins {` block, or a POM with no `<build>` element, for the
  Spotless line is refused the same way, and a file keel patches that
  has been deleted as `keel.path-missing` — restore it. Nothing is
  written in any of these cases. Two parts of one run writing the same
  file is still a bug, and still a 500.

- **A 500 in `keel ui` carries its sentence.** An exception nothing
  turned into a refusal was answered as a bare `text/plain` string,
  and the page — which parsed every body as JSON first, consuming it —
  fell back to `POST /api/preview failed with 500`. Some of those
  throws are refusals not yet coded, whose message names the fix.
  The server now answers with the same `{ error: { code, message } }`
  envelope a refusal uses, under the code `keel.internal`, and the page
  shows the message labelled as a bug to report. The page reads every
  body once, as text, and keeps one that is not the envelope verbatim.

- **Coverage refusals say what is missing, not which tag.** A
  vertical a project cannot carry was refused with the unmet tags of
  whichever adapter came nearest — `would need arch.server-http` on a
  CLI, `would need framework.quarkus` for `distribution` on a Spring
  CLI, `lang.go` on a TypeScript front end — mostly things no command
  can add. The refusal now names the vertical by its title and speaks
  in the stack finder's words: an entrypoint the project lacks by its
  label (_"Observability needs an entrypoint this project does not
  have: HTTP server — a REST endpoint"_), and a language, framework,
  runtime, build system or layout never — the vertical _"has no
  adapter for this project's stack"_, naming the nearest stack of the
  project's shape that carries it on its dials where one does, or,
  where only the build system differs, _"has no adapter for this
  project's build system; it needs Gradle — …"_ (distribution on a
  Quarkus CLI on Maven). `distribution` on a Spring or Micronaut CLI now
  reads as the HTTP entrypoint it lacks, as on every other CLI. At the
  root of a composite product, every vertical the root cannot carry —
  not only `agent-harness` — is refused naming the services that can
  take it, where it used to report a gap for some other stack. The
  code is still `keel.uncoverable-vertical`; at a product root it is
  `keel.wrong-scope` (see _A refusal of the scope says so in its code_
  under Changed), and the tags travel in the refusal's data (see _One
  refusal vocabulary_ under Changed).

- **One installed card in `keel ui` no longer breaks every card
  after it.** An installed vertical's card is a re-render, and the
  flag saying so outlived the card: every vertical picked next was
  posted as a reapply of something not installed, refused as
  `keel.vertical-not-installed` with `keel add ci --reapply` on the
  copyable line, until the directory was picked again. Answers
  outlived their card the same way — onto a re-render, whose Generate
  was then refused as `keel.reapply-frozen-answers` over a `--set`
  nobody typed, or onto a plain install, which recorded them for a
  vertical that was not installed. A pick's state no longer outlives
  it, and any change drops a reply still in flight, so a late
  `/api/dials` answer can no longer undo a newer pick. Choosing
  "nothing" for a new context's _Consumes_ now clears the context
  picked before it.

- **Moving to another preset in `keel ui` keeps your dials, and
  says what it could not keep.** Ticking an adapter, or changing the
  language, framework or shape, lands on another preset, and the page
  used to reset the build system, module layout, peer context and
  repository layout to that preset's defaults — Maven and the modulith
  chosen on `quarkus-rest` were gone the moment the CLI adapter was
  ticked, though `quarkus-cli-rest` takes both. They now carry over,
  `keel.dials` snaps only what the new preset cannot take, and a line
  under the Preset picker names each value you had chosen that did not
  survive. A shape move to a shape without the current language fell
  to the alphabetically first one, so a Kotlin backend moved to
  fullstack became `fullstack-go`. It now prefers a language with the
  same framework, then one on the same runtime, then the default
  preset's — Kotlin on Spring lands on `fullstack-spring`, the browser
  front end moved to a backend on `quarkus-cli` — and the line says
  the language changed. The catalog's language nodes
  (`Catalog.finder`) gain `runtime`, which is what the page compares.

- **An answer outside its question's choices is a refusal rather than
  a crash.** An answer a prompt hands back — the page's preview, a
  terminal — that is none of its question's choices is refused as
  `keel.invalid-answer`, naming the `adapterId:questionId` it was for,
  where it was a 500 in `keel ui`. A default outside its own choices is
  an adapter bug and still throws. (`distribution` on a server-shaped
  project with no image, which threw too, now installs the image with
  it: see _A vertical named without what it needs brings it along_.)

- **An adapter's multi-select question takes a selection.** An
  adapter question declared `kind: 'multi-select'` — none ships one,
  a plugin may — had its answer held to the choices as one string, so
  a legal `a,b` was refused as `keel.invalid-answer` and its `''`
  "none" default reported as the adapter's bug. Each value a selection
  names is now held to the choices instead.

- **The `--with` example runs.** `keel new --help` suggested
  `--with persistence,iac`, and `docs/cli.md` `--with distribution,ci`
  and `--with distribution,iac`. The two ending in `iac` are refused
  on every shipped stack, and `distribution,ci` on every one but the
  two Quarkus CLIs, since `iac` is keyed on what `distribution`
  promotes and `distribution` builds the image `containerization`
  emits. Both now say `--with containerization,distribution,iac`, and
  a test plans the help's example on `quarkus-rest` and `go-http` and
  holds `docs/cli.md` to the same one.

- **A child index's rows now resolve.** `keel:children` rows were
  written project-relative, like the root map's, but markdown resolves
  a relative link against the file it appears in — so a row for
  `modules/orders/` inside `modules/AGENTS.md` pointed at
  `modules/modules/orders/AGENTS.md`. The rows are now relative to the
  document that holds them (the title keeps the full path), and drift
  detection resolves them the same way. Latent rather than shipped:
  every family's documents are top-of-chain today, so no emitted
  scaffold carries such a row — found by applying the model to keel's
  own repository (#145), and fixed before #150 makes the seam live.

- **Harness adoption preserves recorded inputs:** repeated-question answers
  and module consumer relationships are replayed without changing ordinary
  question behavior. Harness opt-out refuses plugin activation, and adoption
  refuses composite product roots before staging files.
- **Owned regions hold their boundary tighter.** A transform that
  removes a region the file carried is now a `region-escape` (a
  markerless file left markerless by `whenAbsent: 'keep'` stays
  legal); whitespace beside an existing region at the file's edge is
  no longer forgiven — only a freshly landed region moves the edges;
  the engine re-renders each of its pre-owned `AGENTS.md` slots once
  a run, a second claim being a region declared twice; and the
  ownership key encodes target and marker as a tuple, so a space in
  either can no longer alias two distinct regions into a collision.

### Changed

- **A plugin vertical may no longer be named `module` or
  `entrypoint`.** `keel add` reads either word as a command of its own
  — `keel add module <name>`, and now `keel add entrypoint
<cli|http>` — so a plugin vertical of that id could be installed with
  `keel new --with` but never with `keel add`. A plugin registering one
  is now refused when it loads (`keel.invalid-piece`), naming the
  plugin; rename the vertical.

- **A section keel adds to an existing README, an entry it adds to a
  build file's list, and what a later dev environment adds to the dev
  container land in keel's order.**
  A section a later `keel add` wrote into the root `README.md`, or one
  `--reapply` put back after you deleted it, was appended at the end,
  after every section installed since: `keel add persistence` on a
  project scaffolded `--with toolchain` put `### Persistence` below
  `### Toolchain`, where `keel new --with toolchain,persistence` puts it
  above, and `keel add dev-env` did the same to `### Dev environment`
  on a CLI or SPA project. Such a section now goes before the first of
  keel's sections ranked after it — the entrypoints (`### cli`, then
  `### rest` or `### http`), then the dev environment, monitoring and
  the dev container in the order keel's presets install them, then
  `### Database` and `### Persistence`, then `### Toolchain` — so a
  project built over several runs reads as one built in one. Two
  sections that share a place (`### Observability` and
  `### Monitoring stack`, `### Database` and `### Persistence`) keep
  the order they arrive in, so one put back alone follows the other. A
  section already there never moves. keel's sections are the `### `
  headings after the README's last `## ` heading, outside code blocks
  and HTML comments: a heading of your own above that `## ` heading, or
  a section of keel's you commented out, never decides where keel's go,
  and a `## ` section of your own below keel's (a `## License`) leaves
  none to rank, so a section keel adds after it is appended as before.
  A heading named like keel's still stands in for it, as before, and
  now ranks as keel's, whoever wrote it. A plugin's own section under
  a heading keel does not write goes where its patch puts it, and
  keel's pass it over. A scaffold of any of keel's presets writes the
  README it did; a plugin preset whose README seed has a `## ` heading
  now gets keel's order whatever order it lists its verticals in, and
  one with none gets its own list's order, as before.

  The lists an entrypoint writes into its build files take the same
  rule. Its entries were appended too: `keel add walking-skeleton
--reapply` put an `include(":application:cli")` you had deleted back
  below the port fake's, a `<module>application/cli</module>` below
  every module after it, and a `start:cli` script last. The JVM's
  `settings.gradle.kts` includes and root `pom.xml` modules now go in as
  one run writes them — the seed's, then the CLI's, then REST's, each
  entrypoint's in its own order, then everything after them (the port
  fake, the peer context, persistence, an added context) — so one of
  an entrypoint's several modules deleted alone comes back beside the
  others where it was; and the TypeScript root `package.json` scripts
  go in the order the formatter sorts them. An entry already there
  never moves, and only a root's own list ranks: an include or a
  module on a line of its own, outside a comment, and never a Maven
  profile's `<modules>`. And `keel add dev-env` on a project with
  an HTTP server and a dev container but no dev environment attached
  the definition in the shape it writes on a CLI: `"name"` above the
  Compose note, the docker feature first. It now writes the definition
  exactly as `keel new` renders it there — the note above `"name"`,
  the docker feature after the toolchain's — and keeps anything else
  you wrote into it; on a CLI or SPA project it keeps the shape it
  always wrote. A scaffold of any of keel's presets writes the build files
  and the dev container it did. A plugin preset gets keel's order in
  two more places: one that installs keel's TypeScript entrypoints
  without `code-style`, whose formatter sorts the scripts, now gets
  them sorted, and one tagged `arch.server-http` that installs the dev
  container before the dev environment now gets the definition as
  `keel new` renders it attached, where it got the CLI's shape.

- **`keel add` at a monorepo product root says what its services
  already have, rather than refusing it.** At the root of a monorepo
  product, `keel add code-style` was refused as belonging to a service
  (`keel.wrong-scope`, exit 1: _Code style belongs to a service, not to
  the product root — backend/ and frontend/ have it already_), and so
  were `agent-harness`, `walking-skeleton`, `dev-container`, `gateway`,
  `containerization` (the image the root builds for each service) and
  `observability` (which the one service that can carry it has) —
  while `keel new --with code-style` on the same product set it aside
  with a note. Both phases now give one answer: where no service could
  take it and those that could have it, the add is an Ok that writes
  nothing — no file, the manifest untouched — and exits 0, its note
  naming them: _Code style is already there: backend/ and frontend/
  have it_. Named beside a vertical the root does carry, it is set
  aside and the rest install; beside one the root refuses, the refusal
  still wins. A vertical a service could still take (`persistence`,
  `toolchain`) is refused as before. `keel.project-status` lists these
  under `provided`, each with that note, rather than as refused cards;
  `keel add --list` prints them under _In its services, nothing to
  add:_, and `keel ui` locks them under _In its services_ rather than
  listing them under _Belongs in a service_. A re-render of one at the
  root stays refused (`keel.wrong-scope`), now saying where each
  service has it from: one it installed, _… have it already, and it is
  re-rendered there_, with a hint naming the re-render in each
  (`'cd backend && keel add code-style --reapply'`); the image the root
  builds for them, _Container image is not installed at the product
  root, which builds it for backend/ and frontend/: nothing to
  re-render here_ (`fromProduct` on each such service, in the
  refusal's data), with no hint; and a service's own re-render of it
  says _… the product root builds it for this service: nothing to
  reapply here_, naming no re-render at the root, where there is none.
  And `--refresh` of a vertical the root does not carry is refused as
  `--reapply` of it is, where it was `keel.vertical-not-installed`
  advising _install it with 'keel add code-style'_. A script that read exit code 1 there as "not
  for the root" now sees success — but at a root from an older harness
  generation, where `keel add agent-harness` is refused by the
  generation gate like every other add (`keel.harness-generation`),
  since it installs nothing there to bring forward.

- **An answer an older keel recorded is the one read.** An older
  keel merged every `--set` into the manifest, so a project can record
  an answer for a vertical it never installed — `keel new --set
ci/go-pipeline:provider=gitlab-ci` without `ci`. A recorded answer is
  now read before a supplied one, so `keel add ci --set
ci/go-pipeline:provider=github-actions` there, which the older keel
  took, is refused as `keel.frozen-answer` and exits 1, saying why:
  _… this project's manifest records ci/go-pipeline:provider, written
  by an older keel although nothing installed here asked it, and that
  recorded answer is what is read — remove it from
  .claude/.keel-manifest.json to answer anew_.

- **`keel add module` takes exactly one name.** A second name, which
  was silently ignored — `keel add module billing extra` scaffolded
  `billing` and exited 0 — is now refused, _keel add module takes one
  name, got 2: billing extra_, and the command exits 1.

- **The backend shape says it holds tools too.** The drill-down's
  first question offered _Backend — a service with no front end of its
  own_, and someone after a command-line tool had to read past
  "service" to find it there. It reads _Backend or tool — no front end
  (command line, HTTP service, or both)_ in the terminal wizard, the
  `keel ui` finder and a project's profile (_Building Backend or
  tool_). Frameworks are named as products — _Quarkus_, _Spring_,
  _Micronaut_, _Web Components_ — where the menus, the wizard's
  resolution line and the profile printed the tag's lowercase id; a
  scripted answer no preset scaffolds is refused in the same words
  (_no backend or tool preset scaffolds Java with … on Quarkus_).

- **A monorepo product root says the way forward for what no service
  can carry.** `keel add iac` at the root of a monorepo product read
  _… belongs to a service, not to the product root — none of its
  services can carry it_, and stopped there. It now says why, in the
  words the service itself would use, ending on what would change it:
  _… none of its services can carry it, since it needs Distribution,
  which cannot go in a monorepo service: its release workflows are
  read only at the repository root, which in a monorepo is the product
  root — per-service releases need the polyrepo layout_. `keel new
--with iac` on the product says the same, and the refusal's
  `services` carry each one's `repositoryOnly`.

- **A flag a refusal names on the `keel ui` page stays on one line.**
  `--with`, `--build-system` and their like are set as one literal a
  line never breaks inside.

- **`keel ui` is one page for both phases.** A keel project had a
  step of its own, _What to add_, where a new project has Options: two
  controls for one question, what else goes in. The directory now
  decides the flow. On a keel project the preset steps collapse into
  one read-only **Project** step — what the project is, in the words
  the wizard asked it in: _Preset go-http · Building Backend or tool ·
  Language Go · Adapters HTTP server · Module layout basic_, a product's
  services, its bounded contexts and what it has installed — and
  Options shows the same **Also scaffold** group a new project gets,
  with what the project has ticked and locked, each installed vertical
  with its **Re-render**, and a tab for a bounded context. Generate
  runs `keel add` of what the ticks add, the delta; the commands stay
  two. `keel ui` started in a keel project opens on its Options, and so
  does a product root's **Open backend/**; Generate lands where the
  directory's flow starts — its Options, or, for a product generated
  under the polyrepo layout, whose root holds no project, the
  directory's listing of its services. The
  `/api/project` status gains `profile`: the preset the manifest reads
  as — the drill-down run back over the tags its preset seeded, passing
  over what a vertical added since (a native release's runtime), or at
  a product root the product with exactly its services — and the
  choices that made it, as labelled lines rather than tags.

- **The verticals compatibility matrix says what keel does.** The
  table in `docs/verticals/README.md` is now generated from the
  composition grid's verdicts rather than written by hand, and a test
  fails whenever it falls behind them. It has a column per way in (CLI,
  HTTP server, both, browser SPA) and one for the product root and for
  each product service, and a cell where presets disagree names them —
  _➕ `quarkus-cli`, `quarkus-cli-kotlin` · ⛔ the rest_ for
  `distribution` on a CLI, _↪ monorepo · ➕ polyrepo_ for `ci` in a
  product service. The hand-written table grouped the Spring and
  Micronaut CLIs under a Quarkus-only footnote, marked `gateway`
  addable on stacks where, with no project linked, it is refused, and
  packed the product root and both services into one column. The stack
  catalog's "What each shape installs by default" table is generated
  the same way, and now lists `agent-harness` and `code-style`, which
  every preset installs. `docs/cli.md` lists all fourteen verticals
  `keel add` takes, where it named twelve.

- **`keel new --with` on a product sends each vertical to the one
  service that can take it.** `--with persistence` on `fullstack` was
  refused as belonging to a service (`keel.wrong-scope`); it now goes
  in `backend/`, the one service that can take it, and the plan's
  first note says so — _Persistence goes in backend/, the one service
  of fullstack that can take it_. Where two services could each take
  it (a toolchain, a pipeline under the polyrepo layout) or none can,
  it is still refused as `keel.wrong-scope`, naming each service and
  whether it can take it, and the hint names the pairs to type
  instead: `'--with backend:toolchain' or '--with frontend:toolchain'`
  — but for a pipeline or a release on a monorepo product, whose place
  is the repository root the product root is, where keel installs
  none yet (`keel.uncoverable-vertical`, naming no service).
  One the services that could have it have already — `code-style`,
  `observability`, the image a monorepo root builds — is set aside
  with a note naming what each has it with (_Code style already comes
  with quarkus-rest in backend/ and web-components in frontend/_),
  as a single preset sets aside what it comes with, so one `--with`
  list runs on either; `keel add` of it at the product root now gives
  the same answer (see _`keel add` at a monorepo product root says what
  its services already have_, above).
  Each service's readiness is now read on the build system chosen for
  it and with the product's own extras for it (the service gateway)
  in place, where it used to be read on the defaults. `keel.dials`
  sends a single preset's extras onto a product the same way — in
  `keel ui`, Persistence ticked on `quarkus-rest` is ticked in the
  backend's group of `fullstack` — and names the ones it drops with
  the refusal's sentence; a product's service extras carried back onto
  a single preset are that preset's own.

- **`keel new` keeps your `README.md` and `.gitignore`, on every
  stack.** Create a repository with a README on a hosting service,
  clone it, run `keel new` in it: that now works on all 34 stacks.
  The Go, Rust and `web-components` stacks and the composite products
  refused both files (`keel.path-conflict`, and before that a crash).
  A `README.md` keeps its content, title included, and gains keel's
  own README after it, less keel's title, with the entrypoints'
  sections. A `.gitignore` keeps every line and gains each of keel's
  entries it lacks, in keel's groups, under keel's comments. Each is
  adopted once, and an empty one is written as it would be in an
  empty directory. The JVM and TypeScript stacks, which kept both
  already, now do the same. Their adopted README used to gain only
  the entrypoint's section. Their adopted `.gitignore` stayed exactly as
  it was, so keel's own entries (`build/`, `node_modules/`, …) were
  silently missing. Any other file of yours in the way is still
  refused as `keel.path-conflict`, naming it. Into an empty directory,
  every stack writes the same bytes as before. Under
  `keel add walking-skeleton --reapply` the two files are now yours on
  every stack, as patched files are. A README that has keel's section
  headings is left as it is, edits included. A `.gitignore` regains
  any of keel's entries it lacks. The Go, Rust and `web-components`
  stacks used to rewrite both to keel's pristine copy. A README with
  CRLF line endings, as a Windows checkout under `core.autocrlf` has,
  keeps them, and `--reapply` finds each entrypoint's section in it
  instead of refusing to change it.

- **An answer nothing reads is refused, including one a shared
  question has already taken.** `keel new`, `keel add`,
  `keel add module` and `POST /api/install` refuse, before anything is
  written: a second answer to a question two siblings share, sent
  under the other's id with a different value (`keel.unknown-answer`,
  naming the one read first — the same value under both ids is taken
  once, as scripts answering both bootstraps of a two-entrypoint stack
  do); an answer to a question an installed vertical has settled — the
  CI provider, for `distribution` on a project with `ci`
  (`keel.frozen-answer`); and, under `keel add module`, which took no
  answers before and dropped them unread, any answer at all. At a
  terminal a stray key is still refused before a question is asked; a
  run that asks nothing (`--yes`, `keel ui`) refuses it once the run
  is staged, worded from the adapters it resolved, as the preview
  words it.

- **A refusal of the scope says so in its code: `keel.wrong-scope`.**
  A vertical asked of a composite product's root that belongs in a
  service (`elsewhere`) was refused under `keel.uncoverable-vertical`
  — `keel.invalid-agent-harness` for the agent harness — and
  `keel new --with` on a composite under
  `keel.invalid-extra-verticals`; both, where a vertical still goes
  nowhere (see _`keel new --with` on a product sends each vertical to
  the one service that can take it_), and a monorepo service asked
  for what only a repository root
  reads, are now `keel.wrong-scope`: not here, where
  `keel.uncoverable-vertical` stays not in this project. `ci` and
  `distribution` asked of a monorepo product root are refused without
  being sent into a service, since no service there can take them
  (`keel.uncoverable-vertical`). `keel new --with vcs` on a composite
  is set aside with a note, as on a single preset. A client of `keel
ui`'s HTTP API matching the old codes should match the new one in
  the 4xx body's `error.code`; the terminal prints the sentence and a
  hint, not the code, and exits 1 either way.

- **`keel new` inside a product refuses a directory the product does
  not list.** `keel new --stack=go-http` in `my-product/worker/` of a
  monorepo product scaffolded a project that was neither one of the
  product's services nor a repository of its own. It is refused as
  `keel.inside-product` before anything is asked: adding a service to
  a product is not supported yet. So is a service the product lists
  that no longer holds its project — `backend/` emptied — which was
  scaffolded as a second repository inside the product's, of whatever
  stack was named: _this directory is backend/ of the product at ../,
  recorded as quarkus-rest; re-scaffolding a service is not supported
  yet_.

- **`keel ui` opens a product's services from its root.** At a
  composite product's root, _Belongs in a service_ starts with an
  **Open backend/ (quarkus-rest · Gradle)** button per service, which
  points the page at that directory; in a monorepo service, what the
  product gives it is listed under _Installed_, saying where it comes
  from. `keel.project-status` reports each service's `directory` and a
  `label`, and a new `provided` list.

- **`keel ui`'s brownfield page says what a project can take before
  the click, and takes several at once.** The _What to add_ step
  offered every vertical not installed as one radio group, and about
  half the cards on a CLI project were a refusal, met after the pick in
  a banner above the step. The cards are now read from the project
  status, in the parts `keel add --list` prints: _Ready_ and _Needs
  another capability first_ as checkboxes — ticking Infrastructure as
  code ticks Container image and Distribution with it, and the three
  are one plan and one Generate (`keel add containerization
distribution iac`) — _Not for this project_, collapsed, each with the
  sentence `keel add` would refuse it with, and _Belongs in a service_
  at a product root. An installed vertical has a **Re-render** button
  of its own instead of a card in the same group, and the product's
  glue and a bounded context, which no `keel add` names, are chips
  rather than a pick refused as unknown. A re-render an add proposes
  is offered beside the cards once the preview says so (`--refresh`).
  The bounded-context tab is shown disabled with its reason rather than
  hidden. A refusal is shown in the plan column, where the plan would
  be, as an alert headed by what it is — a refusal, a bug in keel, or
  no answer at all — instead of "The reason is above". A plan that
  writes nothing and runs nothing cannot be generated, unless it is a
  re-render of the agent harness that brings a project from an older
  harness generation forward: that writes nothing when the files are
  current, and still stamps the generation every other card waits on.
  The greenfield _Also scaffold_ group gains the same _Not for this
  project_ part: what the preset cannot carry, with its reason, where
  it used to be left out.

- **`keel add module` on the flat layout says why in a sentence, not
  a tag.** The refusal read `cannot add a bounded context here: …
(incompatible: modules.context; rule
'bounded-context/context-needs-modulith')`; it now reads as the
  rule's own reason, capitalised — _A bounded context needs the
  modulith layout: … "keel add module" needs a project scaffolded with
  --module-layout=modulith_ — the sentence `keel ui` shows under the
  tab it disables, where the flag it names no longer breaks across
  lines. The rule's id travels in the refusal's data instead
  (`refusal.rules`, in `/api/project`'s `moduleRefusal` too), still
  `keel.incompatible`. `keel add --list` lists the product glue and a
  bounded context apart from what `--reapply` re-renders.

- **`keel add --list` says what `keel add` would do here.** Inside a
  project it no longer prints the catalog: every vertical not
  installed is listed under _Ready to add here_, _Ready, with what each
  needs installed first_ (naming them, or the choice between two sets
  of them), or _Not for this project_ — in the very sentence
  `keel add <id>` would refuse it with — then what is installed, and a
  project from another harness generation is said once, first. It
  asks the project status the add front door plans by,
  so the list and the command cannot disagree. Outside a project it
  prints the catalog, as before.

- **One refusal vocabulary, the same in both phases.** `keel new
--with v` on a preset and `keel add v` on the project it scaffolds
  are refused under one code and in one sentence, word for word: the
  `stack '<id>': … drop 'v' from --with, or scaffold a stack that can
  carry it` wrapper is gone from the domain's sentence, and the
  remedy only a command line has is printed under it as a `hint:`
  line, built from the refusal's fields — _"drop 'persistence' from
  --with, or scaffold go-cli-http, which carries it"_ under `keel new`,
  _"go-cli-http carries both this project's entrypoints and
  persistence"_ under `keel add`, `keel link <path>` first for the
  gateway, `cd backend && keel add persistence` at a product root.
  Every sentence is built in one place from a structured refusal —
  which vertical, what the project lacks, the nearest stacks that carry
  it, the services it belongs in, the file in the way — and names no
  tag, no `--with` and no `keel add`: a capability another vertical
  adds is named by that vertical (_"needs what Container image adds"_),
  a build system by its label. `keel ui` receives the same refusal in
  the 422 body as `error.refusal`, beside the sentence. On a composite
  stack an id no vertical is registered under is
  `keel.unknown-vertical`, as on any other stack. A tie between two
  sets of prerequisites now ends _"name the one you want as well"_.
  Codes are otherwise unchanged: a client of `keel ui`'s HTTP API that
  matched refusal text should match `error.code` in the 4xx body
  instead; the terminal prints the sentence and a hint line, not the
  code, so a script there should key on the exit status (1), not the
  words. For plugin
  authors: `ResolutionError` now means only an adapter `after` cycle
  (`keel.adapter-cycle`, its adapters in `adapters`) — an uncovered
  dimension is a `RefusalError` carrying the gap in `refusal.missing`
  — and a file refusal's sentence no longer ends with the adapter id,
  which is in `refusal.adapterId`.

- **"Already there" is not an error.** `keel add X` on a project that
  has X installed exits 0 with an empty plan — nothing written, the
  manifest untouched — and the note _"Version control is already
  installed; 'keel add vcs --reapply' re-renders it"_, where it was
  refused as `keel.vertical-already-installed` and exited 1; named
  beside others, an installed vertical is noted the same way and the
  rest install. `keel new --with` naming a vertical the stack installs
  of its own drops it with the note _"Development environment already
  comes with quarkus-rest"_ instead of refusing the run as
  `keel.invalid-extra-verticals` (still the code for an id named
  twice). A script that read exit code 1 as "already installed" now
  sees success: the project manifest (`.claude/.keel-manifest.json`,
  its `verticals`) lists what is installed. `keel.dials` drops such an
  extra in the same words.

- **`--with` names a set, not a sequence.** Extras install in the
  order they depend on one another — `containerization` before the
  `distribution` that builds its image, `persistence` before the
  `distribution` whose descriptor reads it — whatever order they are
  named in. `keel ui` names extras in menu order, which is
  alphabetical, and `keel new` installed them in the order named, so
  distribution rendered its deploy descriptor before persistence was
  there and `deploy/compose.yaml` came out with no `DB_URL`, silently;
  it no longer does. Extras nothing ties together go in by id — a
  prerequisite added for you as one named would be — so every order
  typed, and every way of naming a set's prerequisites, writes the
  same files and records the same order. The report opens with a note when
  the order typed put one ahead of what it needs
  (`installed in dependency order: …`, `InstallReport.notes`).
  Naming an id twice is still refused.

- **A vertical named without what it needs brings it along.**
  `keel new --with iac` and `keel add iac` on a REST stack install
  Container image and Distribution first, in one run, and the plan
  opens with _"added Container image, Distribution — needed by
  Infrastructure as code"_ — the set `keel ui` already ticked for you.
  Both used to refuse it (`keel.missing-prerequisites`, and
  `keel.uncoverable-vertical` before that); a script relying on that
  refusal now gets the install.
  The code remains for a tie between two verticals that would each
  supply what one needs, which only the user can choose between.

- **A re-render asks what it has nothing recorded for.**
  `keel add --reapply` (and the new `--refresh`) keeps every recorded
  answer frozen, but an adapter the vertical newly resolves to — the image
  release pipeline beside a native one, once a JVM image is there — is
  asked its questions and takes `--set`, rather than taking its
  defaults silently. `keel.reapply-frozen-answers` now refuses only a
  `--set` for an adapter the manifest records answers for; any other
  answer is held to the run like any install's (`keel.unknown-answer`,
  `keel.frozen-answer`). In `keel ui`, a re-render's preview shows the
  questions it asks. `AddVerticalCommand` and the install target carry
  `verticals` (a list) where they carried `vertical`; the web API still
  takes `vertical` as a list of one.

- **`keel.dials` pins the extras on every target it settles** — to
  `[]` when none are named, as it pins every other dial — so
  `keel.preview` no longer asks the extras question of a settled
  target. A caller that settled its target through `keel.dials` and
  relied on the preview to offer the list reads `verticals` instead.

- **`keel.dials` reports readiness and snaps the extras to their
  closure.** `DialOptions` gains `verticals` — the preset's own
  (_included_) and every extra it offers, each _ready_ or _needs_ with
  the verticals it needs first — and `adjustments`: posted extras come
  back with their prerequisites added and what this preset cannot take
  dropped, in install order, each change with its reason, where they
  used to be pruned without a word. The extras menu is labelled by
  title rather than id.

- **Distribution's prerequisite is a declaration.** The five container
  distribution adapters require `deploy.container-image` in their
  predicates, and the check that threw inside their `contribute()` is
  gone. `keel add distribution` on a project with no image installs
  containerization with it, first (see _A vertical named without what
  it needs brings it along_). A plugin states a prerequisite the same
  way: a `requires` tag another vertical promotes.

- **An answer reaches only the adapters it belongs to, and a stray
  one is refused.** `keel new` wrote every `--set` into the manifest
  of every scope it created, so a Quarkus bootstrap's `basePackage`
  given to a Spring stack scaffolded some sources under it and the
  rest under the default — a split package — and a product recorded
  each service's answers in every service. `keel add` merged any key
  into the manifest: `--set vcs/git-init:defaultBranch=trunk` on
  `keel add ci` rewrote an installed vertical's recorded answer
  without re-rendering a file. Now an answer reaches only the adapter
  it is keyed to, or one sharing the question with it (a framework's
  CLI and REST bootstraps, the CI provider), and only the adapter that
  read it records it. Before anything is written, dry run or not, a
  key no adapter of the plan reads is refused as
  `keel.unknown-answer`, naming the adapters that do take answers; a
  key for a vertical already installed as `keel.frozen-answer`; and a
  value outside its question's choices as `keel.invalid-answer`, from
  `--set` and a `keel ui` install body alike — it used to end in
  whatever the adapter threw, a 500 in the page. **Scripts that pass
  `--set` for another stack's adapters now fail loudly** rather than
  splitting a package: key the answer to one of the adapters the
  refusal names. Answers a manifest already recorded are not held to
  today's choices, so `--reapply` is unaffected. `keel ui` drops an
  answer once its preview stops asking for it, so an extra unticked
  after its question was answered no longer posts that answer.

- **A persistence choice a stack cannot serve is no longer offered.**
  The `engine` and `migrations` dials offered `mariadb` and
  `liquibase` on every HTTP stack, and an install deep in
  `persistence` then threw on the ones that could not serve them —
  `mariadb` off the JVM, whose Go/Rust/TS drivers speak only
  PostgreSQL, and `liquibase` on it, whose dev/test replay is
  Flyway-wired: a choice the prompt and `keel ui` listed, answered with
  a crash (a 500 in the page). Each choice now declares where it
  applies, and a stack is offered only the ones it can serve —
  `go-http`'s engines are `postgres`, a JVM stack's migrations tools
  `flyway`. A `--set` or an install body naming another is refused as
  `keel.invalid-answer` ("choices: postgres") before anything is
  written. Plugin authors get the same field: a `QuestionChoice` takes
  an optional `predicate`, read like an adapter's against the
  project's tags; a choice without one is offered everywhere, as
  before.

- **`keel new` asks two more questions**, `changelog` and `commitHook`,
  both sticky and both defaulting to yes (#143). They come before the
  repository's own questions because adapter id orders the questions
  within a vertical. `--set vcs/changelog:changelog=no` and
  `--set vcs/commit-conventions:commitHook=no` decline them
  non-interactively.

- **The navigation index projects services, not only modules** (#142).
  `DocsIndexInput` gains `services`, `realizeHarness` takes the
  manifest instead of just its modules, and `keel docs sync|check`
  reads both. A single-service project records no services, so the new
  rows contribute nothing there — the manifest is the declaration, the
  way `modules[]` already was, and no handler branches on what kind of
  root it is looking at.
  **`HARNESS_GENERATION` stays 1.** Checked against
  `src/domain/contract/region.ts` and the marker's own rule in
  `manifest.ts` ("bumped by a change that moves a sentinel, a region or
  a harness document an older scaffold carries"): this moves none of
  the three — it adds a document to a root that never had one. An
  existing product root is untouched and stays quiet under
  `keel docs check`, since the projection returns nothing for a
  manifest without `agentic.harness`; it gains the root harness only by
  being scaffolded again.

- **keel dogfoods its own per-directory-docs model** (#145). The root
  `AGENTS.md` is 646 lines down to 111 — the same ≤ 120 budget keel
  emits — and nothing was deleted: the e2e grid moved to
  `tests/e2e/AGENTS.md`, CI/release/PR mechanics to `.github/AGENTS.md`,
  the documentation and changelog policy to `docs/AGENTS.md`, the
  template-tree and version-pin rules to `assets/AGENTS.md`, the testing
  approach and guard-suite index to `tests/AGENTS.md`, the four standing
  engine notes (registration, compatibility, drill-down,
  presets-as-data) and the composition-adapter naming note to
  `src/domain/core/AGENTS.md`, and the repository tree to
  `docs/development.md`. Each `src/` layer document gained a "what lives
  here" opener. The root now carries a `keel:map` region indexing all
  eleven documented directories, `tests/AGENTS.md` a `keel:children`
  region for `tests/e2e/`, and every documented directory a one-line
  `CLAUDE.md` pointer so Claude Code lazy-loads it exactly when files
  there are touched. Measured with the evals' offline context audit
  (`evals/lib/context-audit.mjs`), what an agent starting at the
  repository root must load before doing anything fell **82.6 %** —
  648 lines / ~8.9k approx. tokens to 113 lines / ~1.5k. The
  contributor prose in total grew 874 → 987 lines, which is the point:
  relocated and indexed, not deleted. This is keel's own harness only;
  no emitted document, sentinel or region moved, so `HARNESS_GENERATION`
  is unchanged.

- **The emitted `AGENTS.md` is a terse root** (wave 2 of the
  agent-harness redesign, #134): ≤ 120 lines including keel's
  regions, down from ~290. The universal body keeps the dependency
  rule, the dispatch-seam opening rule, the error→transport line,
  tests, workflow, comments and a **working-agreements** block in
  the vocabulary of the augmented-coding-patterns catalog (Lada
  Kesseler et al., credited in the file); mechanical rules stay in
  hooks. Gone: the four dispatch stances of languages the project
  does not use, the six directory bullets, the modulith essay,
  "walking skeleton first", the principles list, `/docs-check`
  (which never existed), decision dates and the CLI plug. The root
  ships empty `keel:map` and `keel:skills-index` slots for the
  index issues to fill.
- **The family stack section carries the layout map.** The
  sentinel region the family kits own (`keel:stack-runbook`) now
  sits right under the preamble and holds, beside the command
  table, **only this project's** dispatch stance and a layout map —
  the path grammar of the shape that was scaffolded (family ×
  layout × entrypoints), naming where a context's wiring, its peer
  gateway, its seam and the migrations live. Measured with the
  harness evals' navigation probes, that is what turns "grep for
  the wiring file" into "read the map": against the committed
  baseline (same five stacks, same ten Sonnet sessions,
  `evals/results/after-wave2-claude-code-scripted.json`), the
  context every emitted harness asks an agent to carry fell 55 %
  (~3.7k → ~1.6k tokens), turns 20 % and embedded searches 43 % on
  average, with the JVM probes down 31–43 % in turns and 26–32 % in
  wall clock; the Go, Rust and TypeScript probes moved less. A guard test
  (`tests/domain/core/verticals/harness-budget.test.ts`) holds every
  non-composite stack on every layout under the line and byte budget
  and refuses a stance leaking across families.

### Added

- **A project's entrypoints can grow: `keel add entrypoint <cli|http>`.**
  A project's entrypoints were fixed at `keel new`: `keel add
observability` on a CLI project was refused, its hint naming the
  preset that carries both, and the only way to an HTTP server was to
  scaffold that preset afresh and move the code across. `keel add
entrypoint http` on a CLI project, or `keel add entrypoint cli` on an
  HTTP one, now grows the project into that preset, its twin, and
  leaves byte for byte the tree `keel new` of the twin writes on the
  same build system, module layout and agent-harness setting —
  `keel new --stack=quarkus-cli && keel add entrypoint http` is
  `keel new --stack=quarkus-cli-rest`, manifest included but for its
  timestamps, and queues the same deferred actions — the JVM's build
  wrapper and formatter, `go mod tidy`, `pnpm install` or
  `cargo check` — without the repository's setup (`git init`, the
  hooks path). It installs the other entrypoint's bootstrap and writes
  nothing of the one already there — an edited `Main` stays as it is,
  though on the JVM the queued formatter formats the whole project as
  the pre-commit hook does, and a file of yours where the new one goes
  is refused as `keel.path-conflict` before anything is written —
  then, adding HTTP, the dev environment and observability, asking
  only for the monitoring stack's shape. On a project that took
  extras, the part of an extra that applies to the new entrypoint
  comes too, asking its own questions, as in the twin with that
  extra: a native Quarkus image with distribution, grown a CLI, gains
  the native CLI's release workflows and asks their `targets`. It
  re-renders the agent harness, whose runbook and skills speak of the
  entrypoints, and shows the diffs. An entrypoint the project has
  already is an Ok that writes nothing, and refuses an answer supplied
  for it, as `keel add` does where there is nothing to run. It is
  refused on a project another keel generation scaffolded
  (`keel.harness-generation`, as every `keel add` is, naming no keel
  to pin where the project has no marker, since no keel that writes
  none has the command), in a product's root or monorepo service
  (`keel.wrong-scope`), for a word naming no entrypoint
  (`keel.unknown-entrypoint`), for a front end or a project
  no preset grows into (`keel.uncoverable-entrypoint`), where the
  entrypoint would break a plugin vertical's rule, as `keel new` of
  the twin with that vertical is (`keel.incompatible`), and, for now,
  on a modulith whose peer context or added modules are wired into its
  entrypoints (`keel.contexts-need-rewiring`, naming them). Where the
  project is linked to another that now gets an HTTP server it never
  recorded, the report names the `keel link` that records it.
  `keel ui`'s API takes it as the target
  `{ "kind": "add-entrypoint", "entrypoint": "http" }`, which it
  previews and installs as the CLI does; the page does not offer it
  yet. The composition grid holds all 192 single-entrypoint backend
  cells to their twins, both ways, on every dial setting (I10, hard):
  128 grow, and the 64 with the peer context are refused. See
  `docs/cli.md` → `keel add entrypoint`.

- **A weekly composition sweep covers what the grid cannot afford to.**
  The composition grid in `verify` reads each preset on its opening
  dials only, each extra alone and the whole menu, and answers one
  choice per question. The rest was planned under epic Q and never
  swept: every other dial setting, every set of offered extras, every
  pair of them arriving in one run and in two, and every answer a
  question offers. `.github/workflows/composition-sweep.yml` now
  sweeps it weekly (Monday 04:41 UTC, and on dispatch). It is
  report-only and never a PR gate. It runs three opt-in suites under
  `tests/sweep/` (`KEEL_RUN_SWEEP=1`; `KEEL_SWEEP_STACKS=go-http,ts-cli`
  narrows a run), each on every dial setting `keel.dials` offers every
  preset, products included:
  - `extras` takes the full powerset of the menu, each set ticked as
    the page ticks it. Each set goes to `keel.dials`, to a preview and
    to a dry-run install, and is named backwards and, for up to three,
    in every order.
  - `arrival` installs every ordered pair of extras for real, in one
    run and in two (`keel new --with x`, then `keel add y` with the
    `--refresh` it proposes), and each extra on its own the same way
    (`keel new`, then `keel add y`), then compares the trees. This is
    the one comparison an undeclared `Vertical.reads` cannot pass.
  - `choices` answers every choice of every question that the whole
    menu, no extra, or any one extra asks.

  A red run is the report: one failing test per preset, its findings
  grouped by kind, each with the command lines that reproduce it.
  A full run takes 57 minutes on four vCPUs, about 179,000
  dispatches. What it found when it landed is recorded in
  `docs/roadmap.md` → Q3.4, for later steps. The first run turned up
  one throw on a dial setting the grid never reads: `persistence` on
  the modulith layout with the peer context, on the Micronaut REST
  presets and the TypeScript HTTP presets. It also found that moving
  a native-binary distribution onto the image's release pipeline
  (`keel add containerization --refresh distribution` on
  `quarkus-cli-rest`) leaves the native release's workflows behind;
  `docs/verticals/distribution.md` now says so.

- **An unknown `--stack` or vertical id names the one it most likely
  meant.** `keel new --stack=quarkus-cli-http` answered with the 34
  ids there are and left the reader to spot `quarkus-cli-rest`. The
  refusal now names it first — _unknown stack 'quarkus-cli-http' — did
  you mean 'quarkus-cli-rest'? Available: …_ — still
  `keel.unknown-stack`, still writing nothing. Preset ids grew family
  by family, so a guess is usually a real facet in the family's other
  word, and the nearest id is read by facet words before spelling:
  what an id spells, then what its tags and entrypoint say
  (`go-rest` → `go-http`), then what a product's services say
  (`fullstack-quarkus` → `fullstack`), and edit distance only where no
  word matches (`quarkuscli`); an id near nothing names nothing. An
  unknown vertical in `--with` or `keel add` is answered the same way
  (`keel.unknown-vertical`), by its id and its title (`container` →
  `containerization`, `persistance` → `persistence`). The page shows
  the same sentence in its 422.

- **A product's services take extras of their own when it is
  created.**
  `keel new --stack=fullstack --with backend:persistence,frontend:dev-env`
  names each extra with its service, as `--build-system backend=maven`
  names a build system; each service's extras are planned in that
  service as a single stack's are — what one needs first is added,
  what the service already has is set aside, both said in the plan's
  notes under the service's name — so `--with backend:persistence`
  writes what `keel new` and then `keel add persistence` in `backend/`
  would; what a monorepo service has from its product root — its
  version control — is credited to the product, as `keel add vcs`
  there says. A pipeline or a release in a monorepo service is refused as
  `keel.wrong-scope`, before anything is written, as `keel add ci`
  there is, and the hint under a service's refusal names the pair to
  drop (`drop 'backend:ci' from --with`), never another stack to
  scaffold instead. A path the product lists no service at, an id named twice
  for one service, the two forms mixed, and a `path:id` pair on a
  single-service stack are refused as
  `keel.invalid-extra-verticals`. `NewProjectTarget` and the web
  target take the same as `services`, keyed by service path
  (`{ "backend": { "extraVerticals": ["persistence"] } }`).
  `keel.dials` reads each service's own menu (`services[].verticals`,
  over the scope the product scaffolds it in: its build system, the
  product's extras for it and, under the monorepo layout, what the
  product root gives it), snaps each service's selection to its
  closure, and says what it moved, naming the service
  (`adjustments[].service`). In `keel ui` the Options step of a
  product has an **Also scaffold in backend/** group per service, the
  command line under the plan spells the pairs, and the review lists
  _Persistence in backend/_.

- **`keel ui` can leave the agent harness out.** `--no-agent-harness`
  was the one `keel new` flag the page could not express. On every
  single-service preset the **Agent harness** chip under the Options
  step's _Comes with_ list is now a switch: pressed off, the target
  carries `agentHarness: false` (`POST /api/dials`, `/api/preview` and
  `/api/install` all take it), the plan drops the agent documents,
  skills and hooks, the command line under it gains
  `--no-agent-harness`, and the review says _Agent harness: left out_.
  A preset move keeps it off where the new preset can, and a move onto
  a product, whose every service carries the harness, says it could
  not. `keel.dials` reports where the switch exists (`agentHarness`),
  and with the harness left out lists a vertical that would switch it
  back on — a plugin's, itself or through a prerequisite — as
  unavailable and drops it from the selection, in the sentence
  `keel new` refuses the pair with; the terminal's extras question
  reads the same menu. That sentence now
  says the vertical "switches the agent harness back on" rather than
  naming its tag, and `--no-agent-harness` on a composite stack is
  refused as _every service of a composite product carries the agent
  harness_.

- **The preview reports the answers an install would refuse.**
  `keel.preview` (`POST /api/preview`) lists each answer it was sent
  that the run does not read as `unusedAnswers` — each with its
  `adapter`, `question`, `code` and `message`, the refusal an install
  of the same body gives, by the same function over the same plan —
  and previews the body without them, rather than planning around them
  in silence. The
  install report carries that plan as `resolvedAdapters`: each adapter
  the run resolved, the questions it asks and the ids it borrows
  answers from.

- **Plugin contract: `Question.shared: 'project'`.** Marks a question
  about the project's identity — its name, package, module path or npm
  scope — rather than about the piece asking it; keel's bootstraps
  declare it. Nothing about the answer is persisted differently: it is
  a marker the preview reports on the question (`PendingQuestion.shared`)
  so a front end moving between presets can carry the answer onto the
  new preset's bootstrap. In a product each service's bootstrap asks
  its own. Registration refuses any other value.

- **Plugin contract: where a vertical goes in a product.** Two
  optional declarations, each read by one structural check and neither
  a tag. `Vertical.placement: { scope: 'repository', because }` says a
  vertical's output is read only at a repository root — keel's own
  `vcs`, `ci` and `distribution` declare it — so `keel new` leaves it
  out of a monorepo product's services, and `keel add` there reads it
  as the product root's or refuses it in the words of `because`.
  `Adapter.providesInServices: { vertical, stacks }` says what product
  glue builds inside its services — keel's `compose.yaml` glue declares
  the images it builds, and writes them by the same field — so that
  vertical reads as already there in those services, and a service
  whose stack is not listed (a plugin's backend) keeps it to add, the
  product's `keel new` report saying so. Registration refuses a
  placement with no reason. The product glue also declares the rule
  `fullstack/one-harness`, which is what now keeps a service's agent
  harness off the product root.

- **The preview carries what the run decided on its own, and the
  status which installed verticals re-render.** `keel.preview`
  (`POST /api/preview`) reports the install's `notes` and
  `refreshProposals`, as the dry-run report does, so a front end can
  offer a proposed re-render before Generate. Each `installed` entry of
  `keel.project-status` says whether `keel add <id> --reapply` can
  re-render it (`reapplicable`), and names the product glue and a
  bounded context by title. `keel.dials` lists every registered
  vertical in `verticals`, those the preset cannot carry as
  `unavailable` with the `refusal` `keel new --with` would give them.

- **The project status answers before the click.**
  `keel.project-status` (`GET /api/project`) gives every vertical not
  installed its readiness — `ready`, `needs` with what installs first
  (`requires`), or `unavailable` with the `refusal` `keel add` would
  give, code, sentence and data exactly as its 422 body carries them —
  read by the same planner `keel add` plans by, over the project's
  tags, installed verticals and their rules. The gateway with nothing
  linked is listed again, as unavailable with its sentence, rather than
  hidden. The status also reports `harnessGeneration` (the manifest's
  marker beside the generation this keel writes) once, rather than as
  the same refusal on every card — `keel ui` says so above the cards —
  and `moduleRefusal`, why `keel add module` would be refused, whenever
  `canAddModule` is false. See `docs/ui.md` → The API.

- **Plugin adapters can refuse a file in their way.** `PathConflictError`
  and `PathMissingError` are exported from `@rgoussu.dev/keel/plugin`:
  an adapter that meets a file it would overwrite, one lacking the
  block it patches inside (`new PathConflictError(path, adapterId,
"'plugins {' block")`), or a patch target the project no longer
  holds throws one, and the user gets `keel.path-conflict` or
  `keel.path-missing` naming the file rather than a crash. They are
  classes keel knows by identity, so they hold for a plugin that
  imports them from the copy of keel that runs it; a copy bundled into
  the plugin is not recognised (see `docs/plugins.md` → A file in the
  way). keel's own JVM formatter no longer reaches into the engine to
  raise them.

- **`keel add` takes several verticals, and proposes the re-renders an
  add calls for.** `keel add containerization distribution iac` — or
  `keel add containerization,distribution,iac`, as `--with` spells a
  list — is one plan and one run, installed in the order they depend on one another
  whatever order they are named in, and writes what three adds in a
  row write; naming one twice is refused (`keel.invalid-verticals`).
  When an add changes what an installed vertical would render —
  `persistence` after the `distribution` whose deploy descriptor reads
  it for `DB_URL`, a JVM image after a native-only distribution — the
  report says so (`note: refresh proposed: …`,
  `InstallReport.refreshProposals`) and re-renders nothing on its own.
  `--refresh <ids>` takes a proposal up in the same run, after what
  the re-rendered vertical reads, under `--reapply`'s posture, with a
  diff for every file it rewrites; a native-only distribution
  re-rendered beside a JVM image then ships that image's fast-jar. Where
  such a re-render is all that stands in the way of a vertical asked
  for — `iac` after a native-only distribution — the add is refused as
  `keel.needs-refresh`, naming it (_"Infrastructure as code needs
  Container image, then Distribution re-rendered — …"_), and the
  terminal's hint spells the run: `keel add iac --refresh
distribution`. The web API's install target takes `verticals` and
  `refresh` too. See `docs/cli.md` → `keel add`.

- **Plugins can say what each adapter adds, and what a vertical
  reads.** Two optional fields, read by the planner keel's menus and
  front doors plan by. `Adapter.promotes` is an adapter's own share
  of its vertical's `promotes`: a vertical's list is the union over its
  adapters, and read as a whole it offers `iac` on a Quarkus CLI, whose
  only matching distribution adapter builds native binaries and never
  the container image `iac` is keyed on. `Vertical.reads` names the
  verticals `contribute()` reads the presence of — `distribution`
  reads `persistence` and `observability`, whose variables its
  deployment descriptor carries only when they are there — so that in
  one run it installs after them. keel's own distribution and image
  adapters now declare theirs. A plugin declaring neither loads
  unchanged, but one whose `contribute()` reads another vertical's
  presence should now declare `reads`: `--with` no longer installs in
  the order named (see _`--with` names a set, not a sequence_), so
  without it the vertical may run before the one it reads. Registration refuses an adapter promoting what its
  vertical does not declare, and a cycle of `reads`, naming the
  plugin; a `reads` naming a vertical nobody registers is ignored, so
  a plugin still loads beside another that is not installed. The
  installer holds an adapter's `tagsAdd` to its own `promotes` when it
  declares one. See `docs/plugins.md`.

- **The `vcs` vertical grows its working conventions** (#143): two new
  dimensions on the vertical every stack already installs, each
  individually declinable through one sticky question defaulting to
  yes.
  - **`vcs/commit-conventions`** emits `.githooks/commit-msg`, a
    Conventional Commits gate in **POSIX `sh` + `grep`** — no
    commitlint, no husky, no Node, because a scaffolded Go, Rust or
    JVM project cannot assume one — and points `core.hooksPath` at the
    tracked `.githooks/` directory rather than the per-clone
    `.git/hooks/`. A repository that already points `core.hooksPath`
    elsewhere keeps it, with a warning, the same brownfield posture
    `vcs/git-init` takes. The rejection names the grammar, the legal
    types and two examples, so a retry is informed rather than a
    guess, and the subject is printed rather than interpolated into a
    shell heredoc. Merge, revert, fixup, squash and amend subjects are
    git's own wording and are never refused.
    **It ships no Claude Code hook, and that is #143's open decision
    resolved:** git already refuses the commit and puts the reason on
    stderr, which is where an agent reads it, so a `PreToolUse` gate
    would spend a slot of the reminder budget restating what the agent
    is about to be told. A project with no harness still gets the gate.
  - **`vcs/changelog`** emits keel's own split-changelog convention
    outward — `CHANGELOG.md` with `[Unreleased]` and a newest-first
    release index, `docs/releases/` for the cut sections, and
    `scripts/cut-changelog.sh`. **The cut rides POSIX `sh` + `awk`**,
    not keel and not `npx`: cutting a release is the one moment you
    least want a missing runtime. Compare links come from
    `git remote get-url origin` at cut time, so a project with no
    remote gets no links rather than wrong ones.
  - **One source of truth for the shape.** The emitted template and
    keel's own `CHANGELOG.md` are now checked against the same
    structural rules (`tests/support/changelog-shape.ts`) in `verify`,
    which is what makes "matches keel's own" a fact rather than a
    claim. `tests/changelog.test.ts` is that checker's other consumer.

- **A composite product root gets an agent harness** (#142). Until now
  it got none — no `AGENTS.md`, no `CLAUDE.md`, no shims — so an agent
  opened at a monorepo root had nothing: nested service documents
  auto-load in only some tools, and no tool hoists a service's
  `.claude/` upward. The new `fullstack/product-harness` adapter lands
  the pair and the `.gemini` / `.aider` shims over a thin product-root
  document: what the product is, how to run the composed environment,
  the service index, and one rule — **work inside a service, under that
  service's own harness.** The service rows are the engine's
  `keel:map` projection over `manifest.services[]`, the same seam that
  projects a row per bounded context, so `keel docs sync|check`
  recomputes and drift-guards them and a service recorded later needs
  no change to the adapter. Every row resolves, because `keel new`
  refuses `--no-agent-harness` on a composite stack. **Nothing is
  hoisted**: no `.claude/settings.json`, no hooks, no skills, and no
  `keel:skills-index` slot — a hook at the root would run the wrong
  gate for whichever service the change is in, and the emitted document
  says so rather than leaving a reader to conclude the root was
  forgotten. A polyrepo product has no shared root and gets none of
  this.
- **`navigation/fullstack` eval probe** (#142) — the first case whose
  workspace is a product root, with all three questions crossing the
  service boundary the root's map exists to bridge. The `baseline`
  campaign grows from five cases to six (ten sessions to twelve, the
  guard in `tests/evals/probes.test.ts` moving with it).

- **`tests/repo-docs.test.ts`** — the repo-local `keel docs check`
  (#145). It holds the root `AGENTS.md` to its line budget and its three
  headings, holds every `keel:map` row to the document it points at, and
  holds each row's description byte-identical to that document's own
  `<!-- keel:purpose: … -->` line — the one-description rule the emitted
  skills index already holds, applied to keel's own map. It also
  requires the sibling `CLAUDE.md` pointer beside every document, checks
  that a nested document is reached from its parent's `keel:children`
  region rather than the root map, and fails on any relative link that
  does not resolve. `package.json`'s `files` gains `!assets/AGENTS.md`
  and `!assets/CLAUDE.md`, so keel's own contributor notes stay out of
  the published tarball.

- **Harness evals, lane B** (#141, wave 4): task evals in the
  SWE-bench shape, an A/B protocol over harness variants, and a
  report-only workflow.

  **Five task cases, one per family** (`evals/cases/task/`). The setup
  injects a failing test into a scaffolded project and the oracle is
  `check.sh` — the injected test passes **and** the project's own
  build stays green. Each is the same change carried through every
  ring of that family's hexagon, so a campaign compares harnesses
  rather than languages, and each ships a reference `solve.sh`.
  `node evals/run.mjs --solvable --campaign tasks` proves all five:
  it prepares a real workspace, checks the oracle starts **red**,
  runs the reference solution, and checks it ends green — because an
  eval whose oracle is already green measures nothing while looking
  perfectly healthy.

  **A/B over harness variants.** A campaign records the variant it
  ran under (`--variant <id>`), and an overlay directory
  (`--overlay <dir>`) is copied over each workspace after the
  scaffold and before the git baseline — with a `.keel-remove` list
  for the ablations, which is what `evals/overlays/no-nested-docs`
  is. `node evals/ab.mjs --before … --after …` pairs two benchmarks
  per case and reports each metric's delta against the pooled spread
  of the two samples: N=3 is a regression tripwire, so a delta inside
  that spread is named as this campaign's noise, and an analyst pass
  flags the cases that discriminate nothing or discriminate at
  random. It refuses to compare across campaigns, drivers, versions,
  modes or models — an A/B varies the harness and nothing else.

  **`.github/workflows/harness-evals.yml`**, report-only and never a
  PR gate. Its `solvable` job is weekly and needs no key; its
  `campaign` job is dispatch-only, opt-in, and needs the driver's
  key (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY`, now in AGENTS.md §9).

  Also: the driver registry is one list (`evals/drivers/index.mjs`)
  that `verify` sweeps — every driver declares how it keeps the
  operator's home-dir configuration out of a measured session and is
  held to actually passing it — and a script oracle now runs under
  its case's own wall-clock budget, so a wedged build costs one case
  rather than the campaign.

- **The first habit hook: `diff-size`** (#140, wave 4). Every family
  kit now ships `.claude/hooks/diff-size.sh`, a `PostToolUse` hook on
  the editing tools: after Claude edits a file it counts the
  uncommitted change — the diff against `HEAD` plus the lines of new
  files — and, once per threshold crossed, says so and names this
  stack's own gate to run before committing the part that already
  works.

  A **reminder, never a gate**, and the distinction is the point: it
  reinforces the Chain-of-Small-Steps working agreement mechanically,
  because prose in a root document does not survive context rot. It
  is the first Habit Hook because it is the one such check that is
  genuinely language-agnostic — pure `git`, POSIX `sh`, no
  per-language parser — so one script serves all five families;
  function-size and duplication detectors are deferred until the
  evals can price them.

  Two things keep it from becoming noise: it fires once per threshold
  band rather than once per edit (the band lives in `.git/`, outside
  the tree it measures), and it exits silently wherever it cannot
  honestly answer — no `git`, no repository, no commits yet,
  `KEEL_DIFF_SIZE_LIMIT=0`. That variable is the threshold, defaulting
  to 400 changed lines and documented at the top of the emitted
  script; `diff-size` under `env.KEEL_DISABLED_HOOKS` turns it off
  entirely. Its one reminder brings keel's own total to two, within
  the three the budget leaves it.

- **Lifecycle skills per component** (#139, wave 4): each component
  that contributes files now contributes the matching procedure as a
  skill, gated by the no-fiction rule — a skill ships only for
  something the component's own files make real.

  The family kits ship **one layout lifecycle skill and never both**:
  `add-module` on `layout.modulith` — the procedure `keel add module`
  _is_, plus the failures the 24-cell add-module grid exists to catch,
  each of them silent (the build registration a hand-copied directory
  skips, the per-context wiring class, how this framework's container
  discovers a handler, the dependency scope that keeps the peer's
  domain off your compile classpath) — and `promote-to-modulith` on
  the flat layout, which takes the promotion essay out of the root
  document and turns it into a procedure with this family's own target
  paths, loaded when it is needed and free when it is not.
  `persistence` ships `migrate` (one shape over both halves of the
  `migrations` dial, spelled for the recorded tool, with the two
  nevers) and `iac` ships `deploy` (the OpenTofu loop over the
  recorded cloud and flavor: the workspace **is** the environment, and
  `apply`/`destroy` are the only commands here that cost money).

  Every one is description-triggered through the `SkillSpec` seam,
  declared on its vertical's `skills`, and at most two sentences long.
  The tests assert the **absence** as well as the presence — a
  scaffold with no persistence has no `migrate`, one with no target has
  no `deploy`, and no scaffold carries both halves of the layout pair.

- **`keel docs sync` and `keel docs check`** (#138, wave 4 of the
  agent-harness redesign): the agents' navigation index is now a
  projection of what keel already knows — the manifest plus the
  resolved registry — rather than something anyone maintains by hand.
  `sync` replays every recorded contributor from its recorded
  answers, recomputes every row, and rewrites **only** the
  engine-owned regions that carry them: `keel:map` and
  `keel:skills-index` in the root `AGENTS.md`, and `keel:children` in
  a nested document that has documents beneath it. Prose, rows and
  other contributors' sections outside those markers are untouched,
  a document keel did not write is reported as unindexed rather than
  adopted or deleted, and running it twice writes nothing the second
  time. `check` is the same computation with no writes and a
  non-zero exit naming each drift — a reworded row, a row pointing at
  something that is gone, a hand-edited region — so it wires into CI
  or behind a `command -v keel` probe in the pre-commit hook.

  The map now carries a row per **bounded context** as well as per
  documented directory, and the skills index a row per staged skill
  whose description is byte-identical to that skill's own
  frontmatter (a sweep over every emitted stack holds the two
  together). Where the contexts live is a new
  `DocSection.indexes: 'modules'` declaration on the family kits'
  `modules/` document, so the engine carries no per-family path.

  **The same-commit rule is machinery now, not discipline.**
  `keel new`, `keel add <vertical>` and `keel add module` project the
  index inside their own apply — a context's row lands in the commit
  that creates it — an install merging its rows over the ones already
  there, `sync` recomputing the set outright. Documented in
  [`keel docs`](docs/cli.md#keel-docs) and
  [the navigation index](docs/composition.md#the-navigation-index).
  No harness-generation bump: the two root slots this fills are the
  ones every generation-1 scaffold already ships.

- **Per-directory docs** (#135, wave 3 of the agent-harness
  redesign): the context that left the root lands where it binds. An
  adapter contributes a `DocSection` on `Contribution.docs` — a
  directory, a section, a one-line description, a body — and the
  engine lands it as an owned region of `<directory>/AGENTS.md`
  (seeded with `docSeed`, so contributors compose one doc in any
  order; a section two adapters claim is refused naming both), writes
  a one-line `CLAUDE.md` pointer (`@AGENTS.md`) beside it, and
  projects a row per doc into the root `keel:map` slot for the agents
  that never auto-load nested files. The five family kits emit a doc
  in every layer directory the scaffolded layout has — this project's
  language only, the real ports and files, the layer's silent
  failure, under 30 lines each — and `persistence` composes its
  Testcontainers note into the family's driven-adapter doc (`tests/`
  on a basic Rust crate). The context-budget guard holds each nested
  doc to its ceiling, the root plus every nested chain under Codex's
  32 KiB default, and every doc free of the other families' stances;
  one e2e cell per family reads the doc off a real scaffold, and an
  opt-in upstream check (`KEEL_RUN_UPSTREAM=1`) confirms Claude Code
  loads a nested pointer's import. `DocSection`, `docSeed` and
  `docTarget` ship on the plugin surface.
- **`keel add` fails loudly on a scaffold from another harness
  generation** (#137, wave 3 of the agent-harness redesign). Every
  manifest keel creates is stamped `harnessGeneration` (generation 1:
  the terse root, owned regions, the hook seam). `keel add <vertical>`
  and `keel add module` refuse a project stamped with an older
  generation — or with none, scaffolded before the marker existed —
  with `keel.harness-generation`, touching nothing, and name the way
  forward: move the old agent documents and `.claude/` aside (keeping
  the manifest), run `keel add agent-harness` (`--reapply` when it is
  installed), which re-renders the harness and restamps the marker,
  or pin the keel that scaffolded the project. A newer marker asks for
  a newer keel.
- **The hook seam** (#136, wave 3 of the agent-harness redesign): an
  adapter ships a Claude Code hook as a `HookSpec` on
  `Contribution.hooks` — the script, its event and matcher, the
  reminders it may inject, and the slots other contributors own inside
  it — declared on `Vertical.hooks`. The engine stages the script to
  `.claude/hooks/<name>.sh` as an executable adapter-owned whole file
  (a name two adapters claim is refused naming both), wires one
  `.claude/settings.json` entry per hook into whatever the project's
  file holds, records provenance, and re-renders the script around
  its slots on `--reapply`. A hook is a `sh`/`bash` script invoking no
  Node, `jq` or Python; a project realizes at most five reminders
  across its hooks, and keel's own leave two for plugins. Listing a
  hook under `env.KEEL_DISABLED_HOOKS` turns it off. The five family
  kits' `pre-commit-format.sh` and `settings.json` moved onto the seam
  byte for byte. `HookSpec`, `HookEvent`, `hookTarget`,
  `HOOK_REMINDER_BUDGET` and `DISABLED_HOOKS_ENV` ship on the plugin
  surface. See `docs/composition.md` → Hooks.
- **The `agent-harness` vertical** owns root agent documents, cross-tool
  shims and the five family Claude kits. All 28 single-service presets
  install it by default after `walking-skeleton`, preserving project
  file bytes; `keel new --no-agent-harness` opts out and
  `keel add agent-harness` adopts it later. Declared harness elements
  are realized after the run settles, gated by `agentic.harness`,
  including contributors installed earlier and existing bounded
  contexts replayed from the manifest. Formatter configuration still
  installs without the harness. The contributor catalog lives in
  `docs/verticals/agent-harness.md`.

- **Owned regions are a declared, verified seam** (#133, wave 2 of
  the agent-harness redesign): a patch on a shared file names the
  sentinel pair it owns on `ContributionPatch.regions`, and the
  engine holds it to that on every apply — a transform that changed
  anything outside its regions is refused naming the adapter, a
  region two adapters declare on one file is refused naming both,
  and the `keel:map` / `keel:skills-index` slots of `AGENTS.md`
  belong to the engine under the reserved contributor identity
  `keel:engine`, which no adapter may register under. One transform
  (`upsertRegion`) now backs every sentinel idiom keel had grown —
  the stack section of `AGENTS.md`, the hook's format step, the
  `code-style` blocks and the GitLab pipeline regions — and
  `regionPatch` builds such a patch, seed included, for keel's own
  adapters and a plugin's alike; both ship on the plugin surface.
  Emitted files are byte-identical. See `docs/composition.md` →
  Owned regions.
- **Cross-tool loading shims** beside `CLAUDE.md`: `.gemini/settings.json`
  (Gemini CLI reads `AGENTS.md` through `context.fileName`) and
  `.aider.conf.yml` (`read: [AGENTS.md]`). Zero-maintenance: they carry
  no rules of their own.

### Fixed

- **`keel add walking-skeleton --reapply` no longer refuses its own
  stack section, and no longer resets what it does not own.**
  Re-rendering the vertical rewrote `AGENTS.md` pristine and then met
  the family kit's patch filling the sentinel region back in, which
  the reapply guard read as a divergence. A patch that owns a region
  — its transform is its own fixed point — now re-renders it on
  reapply and reports the diff; one that would compound still
  refuses. `AGENTS.md` itself is now the project's document, as the
  spec says: keel seeds it and maintains its sentinel regions, so a
  reapply keeps the notes kept outside them (and a project that
  already has an `AGENTS.md` keeps it and gains the stack section).
  The pre-commit hook likewise comes back re-rendered around the
  format step `code-style` wired in, rather than without it, and
  `.claude/settings.json` keeps the project's own permissions, env
  and hooks beside keel's entry. A
  shared file two adapters write in turn is reported as changed only
  when it ends up different from disk, and a staged executable bit
  survives a later content-only write.
- **The Quarkus CLI run command works.** The stack section, the run
  skill and the README named a Gradle `run` task the Quarkus CLI
  module does not have (no `application` plugin) and a Maven
  `quarkus:dev` with no arguments; both now pass the sample command
  through dev mode's own channel (`--quarkus-args` / `-Dquarkus.args`),
  and the README's "once built" line runs the packaged jar.
- **Harness evals:** the benchmark checkpoint is written atomically
  (a temp file renamed over the benchmark, so a kill mid-write keeps
  the previous checkpoint); `--only` refuses to fold a run from a
  different agent version into an existing benchmark — before the
  first session is spent — reads a benchmark written before
  `unprepared` was counted as having none, prints the summary of the
  merged file it wrote, keeps a case's last complete measurement in
  the file until its re-run has finished, and calls a merged
  benchmark complete only when every case of the campaign is; a
  scaffold that fails
  removes its half-built workspace before the retry. An explicit
  `--model` gets its own results file, and an attended run records
  no model, since the rig cannot verify the one the operator picked.
- **The JVM combo stacks' stack section covers both entrypoints.**
  A `*-cli-rest` scaffold documented the REST command and probe
  alone; the section, its title and the run skill now carry the CLI
  command too.
- **`npm install` no longer dies inside npm on every npm-based
  TypeScript stack.** npm 10 — the npm Node 22 bundles — resolves
  vitest's optional `@vitest/*` peers by walking to whatever vitest is
  `latest`, and once vitest 5 shipped that walk crashed with `Cannot
read properties of null (reading 'edgesOut')` before a single package
  was installed, on `ts-cli`, `ts-http` and `web-components` alike
  (pnpm was unaffected). The emitted root `package.json` now carries an
  npm `overrides` entry pinning vitest to the range the packages
  already declare; the pnpm root carries none. Found by the harness
  evals' baseline campaign, whose TypeScript scaffold was the first
  thing to run against the new `latest`.

### Added

- **Harness evals rig** (`evals/`, wave 1 of the agent-harness
  redesign program): an agent-agnostic runner measuring how well
  coding agents navigate what keel emits. Cases are data
  (`evals/cases/<name>/case.yaml` — nothing agent-specific may appear
  in one), drivers are adapters of an `AgentDriver` port with
  per-mode capability manifests (`claude-code` reference driver in
  scripted + attended modes, `codex` scripted, plus the canonical
  fake), and the oracle judges final workspace state — never agent
  output — alongside wall time and git diff as the universal floor.
  Ships lane-A navigation probes over grown fixtures of five
  representative stacks, a static context-budget audit, and a
  `baseline` campaign the owner runs locally
  (`KEEL_RUN_EVALS=1 node evals/run.mjs --campaign baseline`) to pin
  the pre-redesign "before" — five stacks × two runs, ten sessions,
  a ceiling `verify` holds. The model is pinned rather than
  inherited from the operator's CLI: `--model <id>` on the runner,
  Sonnet by default on `claude-code`, recorded in the benchmark as
  `driver.model`. The benchmark is checkpointed after every run, a
  failing scaffold is retried once and then recorded as `unprepared`
  rather than aborting the campaign or counting as a failure. Live
  runs are opt-in and never a PR gate; `verify`
  covers the rig through the fake driver and fixture transcripts
  only. See `docs/development.md` → Harness evals.
- **The skill seam: adapters ship Claude Code skills as content, and
  the engine stages them.** A contribution may carry
  `skills: [SkillSpec]` — `{ name, description, userInvocable?, body,
supporting? }`, zod-schema'd in `domain/contract/skill.ts` — and the
  applier renders each spec with the one shared `renderSkill`
  serializer and stages it to `.claude/skills/<name>/SKILL.md` as an
  **adapter-owned whole file**: a name two adapters of the resolved
  set both contribute is a hard refusal naming both origins, each
  staged file gets a provenance record in the manifest's `entries`
  (owning adapter, target, pristine hashes), and `--reapply` rewrites
  the file pristine. No emitted skill carries `paths:` frontmatter —
  upstream Claude Code discovery mismatches path-scoped skills, so
  the description is the whole trigger.
  - `Vertical.skills` declares every skill name the vertical's
    adapters may stage — the mirror of `promotes`, checked at install
    the same way, so a front end can report what an assembly ships
    before applying.
  - The five family kits' `run` skill now rides the seam instead of a
    bare `files:` entry — **byte-identically**, pinned per family by
    `tests/domain/core/verticals/run-skill.golden.test.ts`.
  - Plugins ship skills through their own verticals with no special
    case; the skill types are re-exported from
    `@rgoussu.dev/keel/plugin`. The harness contribution model these
    rules belong to is documented in
    `docs/composition.md` → Harness contributions.

### Removed

- **The dormant `Contribution.agentic` / `AgenticBundle` vocabulary.**
  It promised path-based staging of skills/hooks/slash-commands/agents
  into `.claude/`, but the applier only collected the records: nothing
  consumed them, no adapter declared one, and the type was absent from
  the plugin export surface. The skill seam above replaces it
  outright; the hook and doc seams follow as their own typed
  contributions.

### Fixed

- **A refusal raised at the bottom of the install now reaches a front
  end as a refusal.** `resolveVertical` hard-fails when no adapter
  covers a dimension a vertical declares — `keel add containerization`
  on a CLI-shaped project, which has nothing to serve an image from —
  and it did so by throwing a bare `Error` out of `installVertical`,
  past every menu. The CLI coped, because any throw is a message to
  its top-level catch; `keel ui` could not, and answered **500 with a
  bare string**, so the page showed `POST /api/preview failed with
500` for a refusal that names both the missing dimension and the tag
  that would close it.
  - `ResolutionError` is a `DomainError` now, carrying
    `keel.uncoverable-vertical` (the same code `keel new`'s `--with`
    preflight already refuses with, it being the same condition) or
    `keel.adapter-cycle`.
  - `RegistryMediator.dispatch` normalises a thrown `DomainError` onto
    the `Err` rail. `Result` is what the Mediator promises every
    primary adapter, so the seam that promises it is the seam that
    keeps it — rather than the same try/catch in four handlers and a
    fifth copy next time. Anything that is not a `DomainError` still
    throws: a bug must not be dressed up as a refusal.
  - `keel ui` shows it: the banner carries the code and the message,
    the plan says it has no tree _because the run was refused_ rather
    than sitting blank, and the review step repeats the reason next to
    a Generate button it holds shut. Picking a vertical the project
    can carry clears all three.
  - `keel new` and `keel add` print exactly what they printed before.

### Changed

- **The changelog is split per release.** Root `CHANGELOG.md` keeps
  `[Unreleased]` and a dated, newest-first `## Releases` index; each
  released section moved verbatim to
  `docs/releases/CHANGELOG.<version>.md` with its own compare link — a
  deliberate deviation from Keep a Changelog 1.1.0, the split
  Kubernetes and Node.js use. `scripts/cut-changelog.mjs` performs the
  cut at release time (the release commit is a three-file change now),
  the release workflow refuses to publish without the release file and
  uses it as the GitHub Release body, and `tests/changelog.test.ts`
  guards the shape in `verify`. Dead compare links for the
  never-tagged versions (`0.4.0-alpha`, `0.1.0-alpha.1`,
  `0.1.0-alpha.2`) now point at tags that exist, and the index says
  which sections never shipped.

- **A vertical is offered as a card now, not a line in a `<select>`.**
  Which capability to add next is the one real question the brownfield
  page asks, and `iac` or `dev-env` in a dropdown means nothing until
  you have read what it buys you. Each card names the concept it
  bears, the id `keel add <id>` takes, and one line on what installing
  it gets you.
  - `Vertical` gains an optional **`title`** — the concept, as a
    person would name it ("Continuous integration", "Container
    image", "Infrastructure as code"). Resolved rather than read:
    `verticalTitle` spells a title out of the id where a vertical
    declares none, so a plugin's renders as `Acme widget` rather than
    a raw id. Reported on `VerticalDescriptor.title`, so a front end
    never has to fall back for itself.
  - The `distribution`, `containerization` and `vcs` descriptions said
    what the vertical _was_ rather than what it gets you, which is
    fine beside an id in `--list` and useless as the body of a card.
    They now say what appears.
  - **Nothing is pre-selected, and nothing is hidden.** Every
    registered vertical is offered: one this project's shape cannot
    carry says so when picked — with the tag that would carry it —
    rather than being silently absent. Opening on a pre-picked
    vertical meant opening on a refusal nobody had asked for.

- **The stack finder is a four-step drill-down now, and it starts with
  what you are building.** Both front ends narrow the same way, widest
  first: **shape → language → framework → user-side adapters**, where
  shape is _fullstack_ (a backend and a browser front end together),
  _backend_ (no front end of its own) or _frontend_. It replaces
  **language → user-side adapters → framework**, which asked a
  newcomer to know what a "user-side adapter" is before it asked
  anything they already knew the answer to.
  - **A shape is derived, never listed.** Each registered entrypoint
    declares which end it is driven from (`arch.cli` and
    `arch.server-http` from the back, `arch.spa` from the front) and a
    preset's shape is those sides, counted — so a stack that gains an
    `arch.spa` moves shape on its own.
  - **The fullstack products are on the guided path at last.** A
    two-service product carries no `lang.*` tag, so before there was a
    shape axis it appeared in no menu and `keel new` could only reach
    it through "pick a preset by id". It places perfectly well through
    its services: the union of their entrypoints gives the shape, and
    its one back-side service — its backend — gives the language and
    framework, which is exactly the choice a fullstack product leaves
    open. Every shipped preset is now reachable from some path.
  - **`keel new` says where it is.** The drill-down prints what it is
    about to ask, numbers each step it actually asks (a step whose
    answer is already settled is still skipped, so the numbers never
    claim a question that does not come), and names the preset it
    landed on: `keel new: Backend · Java · quarkus · CLI + HTTP server
→ quarkus-cli-rest`. The escape hatch moved with the first
    question: _Other — pick a preset by id_ is now the last choice of
    "What are you building?".
- **`keel ui` is a stepper rather than one long form.** The page walks
  the same questions in the same order as the terminal wizard — one
  step at a time, with a rail across the top, Back/Next, and a review
  at the end listing every choice with a link back to the step that
  made it. The three side-by-side facets are gone; a drill-down is a
  tree, and a grid of dependent controls was a shape you had to
  already understand to use.
  - **The plan stays on screen at every step**, which is the one thing
    a stepper must not take away — flipping Gradle to Maven redrawing
    the file tree in place is the whole reason the page exists.
  - **Every step on the rail is clickable, not just the ones behind
    you.** Nothing on the page can be in an invalid state — every dial
    has a default and `keel.dials` snaps an illegal combination back —
    so the rail is a map, not a gate, and "just show me the plan" is
    one click rather than four screens.
  - **A step with one answer is not a step.** Which steps exist is
    derived from the same tree the terminal wizard skips a question
    from: a language reaching one framework has no framework step, a
    product has no adapters step, and the frontend shape has neither.
  - **Stepping back keeps what still fits.** Moving the shape from
    backend to fullstack with Java + Spring chosen lands on
    `fullstack-spring`; coming out of a product into a backend carries
    the half of its entrypoints a backend can still take.
  - **The preset picker sits above the rail and is on screen
    throughout** — it names the id the answers have landed on, it is
    the flat list of every preset, and it is the only way to name one
    the finder could not place (a plugin's, most likely).

### Added

- **`keel ui` shows the command it is equivalent to.** The page and
  the terminal are two primary adapters over one mediator, so every
  state the form reaches is a `keel new` or `keel add` somebody could
  have typed. The plan column renders that line — flags highlighted,
  answers as `--set`, values quoted only where a shell needs it — with
  a button that copies it, so a scaffold done by clicking can go into
  a README or a CI job. Derived from the same body the review step
  posts, so it cannot describe a different install.

- **Plugins: a project can supply its own stacks and verticals.** keel
  scans `<cwd>/.keel/plugins` — a directory the project owns — and
  loads every entry it finds: a directory holding `keel-plugin.js`, or
  a `.js`/`.mjs` module. A plugin exports `{ name, stacks, verticals,
assets }` and its pieces are written against the ordinary
  composition vocabulary, so the engine reads them through no special
  case: a plugin's `Conflict` is refused and filtered exactly as a
  shipped piece's, and `keel.catalog` reports its stacks and verticals
  alongside keel's own — `keel ui` needed no change to render them.
  - **Templates too.** A plugin declares an `assets` directory and its
    adapters render from it through the same `TemplateSource` port,
    with ids namespaced `plugin:<name>/<path>`
    (`pluginTemplateId`). An id naming a plugin that declared no
    assets fails saying so rather than falling through to keel's.
  - **A directory, not an npm dependency.** `keel new` runs in an
    empty directory with no `package.json` to resolve a name against,
    and keel scaffolds JVM, Go and Rust repositories that have no
    reason to carry one. So what a keel-scaffolded project can rely on
    is: a plugin in `.keel/plugins/` of the invocation directory is
    loaded, in every language family, greenfield and brownfield alike.
  - **Every failure names the plugin, never the engine** — a module
    that throws at load, a malformed `Conflict`, a dimension none of
    its own adapters covers (checked statically at registration, which
    is what separates a typo from a legitimate predicate miss), and an
    id already claimed by keel or by another plugin, which is refused
    rather than silently shadowing.
  - **Trust is explicit, not implied.** Loading a plugin runs its
    code and keel does not sandbox it. What it does instead: discovery
    never leaves the project directory, never resolves a package by
    name and never fetches; every loaded plugin prints one line naming
    it and its module; `KEEL_NO_PLUGINS=1` skips discovery entirely;
    `KEEL_PLUGINS` names extra paths explicitly. See
    [docs/plugins.md](docs/plugins.md) → Trust.
  - **Deferred actions too.** A plugin's adapter may emit `actions`
    beside its files, and they run exactly like a shipped adapter's:
    after `tree.commit()`, through the `ProcessRunner` port, in
    resolution order, and not at all under `--dry-run` — where the
    action's `description` in the plan is the only declaration of a
    side effect the user gets before it happens. An action that
    throws fails the run naming its id.
  - `@rgoussu.dev/keel/plugin` is a new package export carrying the
    plugin contract and its types, for TypeScript authors. A plugin
    has no runtime dependency on keel either way.

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

- **`keel ui` is an application shell, so the stepper never takes the
  plan away.** The wizard's own rule is that the plan stays visible
  throughout, and a page that scrolls as a document only keeps that
  promise on a short step. The page is now a masthead, the rail in a
  band of its own, and two columns that scroll independently: the
  plan — tree, deferred actions, the command line — holds its own
  column whatever the step above is doing. Below 62rem it collapses
  back to one column and the page scrolls as a document.
  - **The panel no longer fights the user.** The shell and the plan's
    skeleton are built once and updated through their properties, and
    a step's controls survive a re-render that did not change the
    step — which used to take the caret out of the field being typed
    in and reset the file tree's scroll position on each keystroke.
    `<keel-question-list>` also restores focus and selection across
    its own re-render.
  - **The questions step is two kinds of decision, and now looks like
    it.** A preview answers with one flat list, so "additional
    verticals" — a field of the command that redraws the whole plan —
    sat between "initial branch name" and "base Java package".
    `binding.kind` already distinguished them: a command-level
    question gets its own heading and is drawn as cards, the same
    control the narrowing steps use, while the adapters' own
    questions are grouped under _Details_ by the adapter that asked —
    which is where the `adapter:question` key now lives, once per
    group instead of on every label.
  - **The plan's file tree is navigable.** Single-child directory
    chains are joined (`src/main/java/com/example` is one row, not
    five), directories fold away and stay folded across a preview,
    and each carries the number of files under it.
  - **The directory step is a path bar.** Every segment of the path is
    a jump, and the folder browser opens on request rather than
    standing permanently open.
  - **Type, colour and spacing are a system.** planks' 1.5 scale is
    kept for space and replaced for text — two steps below its base is
    seven pixels — and the page's tokens now cover both themes from
    one set of names. Backtick spans in keel's own documentation
    strings render as code rather than as punctuation.

- **The stack registry is data.** The 34 presets moved out of the
  TypeScript object literals in `src/domain/core/stacks.ts` and into
  `src/domain/core/stack-presets.json`, resolved against the existing
  registries at load. Nothing in a `Stack` was ever code — `tags` and
  `projects` are strings, and every other field references something
  registered under an id — so the presets are now written as those
  ids, and `stacks.ts` keeps the zod schema they must satisfy, the
  resolution, and the `Stack` type as the resolved in-memory shape.
  Nothing observable changes: `keel new --list`, `keel.catalog`, the
  drill-down grid and every scaffolded tree are identical, which
  `tests/domain/core/stack-registry.golden.json` freezes preset for
  preset and field for field.
  - **A malformed document throws; a dangling reference does not.** A
    shape violation is never a piece someone forgot to install, so the
    schema throws as `parseManifest` does. A preset naming a vertical,
    build system or module layout this build does not carry is dropped
    instead, with a `PresetProblem` naming the preset, the field and
    the id — the answer a plugin needs, where the missing piece may
    legitimately be one the user chose not to install. keel's own load
    refuses any problem loudly: a built-in preset vanishing from
    `keel new --list` is worse than a crash naming the id.
  - `Stack.conflicts` crosses unchanged — a `Conflict` is an id, two
    tag-pattern lists and a sentence, so it is already pure data.
  - Verticals gained a second registry beside the brownfield one:
    `VERTICALS` stays the `keel add` menu, `DECLARED_VERTICALS` is the
    wider id → vertical lookup a preset resolves through. Naming
    `fullstack` in a preset does not make `keel add fullstack` a
    thing.
  - Groundwork for presets supplied from outside this repository
    (#117).

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

- **`docs/composition.md` → Conflicts now distinguishes three kinds of
  refusal**, so the audit behind the entry above does not get re-run:
  a **tag conflict** ("capability X cannot sit with capability Y") is
  a declaration; a **structural fact**
  (`stack.services`/`manifest.services` non-empty on a composite, a
  context name already taken, a `--consumes` target with no seam, an
  unknown id, an invalid enum) stays a check where the shape is known;
  a **capability probe** (`coversFor`, `emitsFor`) asks the adapter
  set a question no tag answers. Of the dozen hand-written refusals in
  the handlers, exactly one was the first kind. The rule stated there:
  do not invent a tag so a check can become a declaration — it buys no
  second reading, which is the only thing that makes moving a rule
  worth doing.

- **`keel ui` narrows its dials by the same rules, through a new
  `keel.dials` query.** A `Conflict` can name two dials at once, and a
  terminal never trips over that because it settles one dial before
  offering the next. A form has no such order: the page rendered its
  build-system and module-layout controls from `keel.catalog`, which
  describes a preset's dials without knowing which combination the
  user is on — so the first rule to constrain one dial against another
  would have had the page offer a combination, post it, and get
  `keel.incompatible` back.
  - `POST /api/dials` takes the same body `preview` and `install`
    take, reads only its `target`, and answers with one menu per dial
    **plus the target snapped to them** — each dial left where the
    caller put it where the rules still allow it, moved to the first
    legal value where they do not. The page adopts that target, renders
    from it, previews it and posts it, so what a control can produce is
    exactly what `POST /api/install` accepts.
  - **Flat, not a cross-product.** Reporting legality inside
    `StackDescriptor` would have grown its shape with every dial added
    and stopped the catalog being a flat description of a preset;
    reporting it from `keel.preview` would have withheld the menus
    precisely where the assembly was already illegal and the caller
    needed them to recover. `keel.dials` never refuses.
  - **No rule moved into the browser.** The peer-context checkbox used
    to read `moduleLayout === 'modulith'`, a third copy of
    `peer-context-needs-modulith` living in the page; it asks
    `dials.peerContext` now. The catalog stays derived and the page
    still never sees a capability tag.
  - The terminal's own menu filters moved to `domain/core/dials.ts`
    rather than being copied, so `keel new`'s questions and
    `keel.dials`' answers are the same functions.

- **The stack and vertical registries are an injected port.**
  `STACKS` and `VERTICALS` were module-level constants handlers
  imported directly, which made the catalog a property of the build
  rather than of the run — a piece keel did not ship had nowhere to
  arrive from. They are now reached through a `Registry` port in
  `domain/contract/ports/`, built once at the composition root and
  immutable thereafter. A port rather than a mutable registry with a
  load step: the mutable version is process-wide state with an
  ordering requirement, where two runs in one process cannot see
  different catalogs and a test's fixture piece leaks into whatever
  runs next. It also puts plugin loading in `infrastructure/`, which
  the dependency rule already keeps `domain/core` away from.
  - The `Stack` vocabulary (`Stack`, `StackService`,
    `BuildSystemOption`, `ModuleLayout`, `ModuleLayoutOption`) moved
    to `domain/contract/stack.ts` beside `Vertical`'s, because the
    port names it and a port may not reach into `domain/core`. Their
    old modules re-export them, so no import changed.
  - `keel.catalog` and `keel.dials` read the port too, so a plugin's
    stack renders in `keel ui` — and gets its dials narrowed by its
    own rules — with no change to `keel ui`.
  - No user-visible behaviour changes with no plugin present: every
    shipped stack and vertical resolves exactly as before.

- **The resolver's thrown refusal now says what the front door says.**
  `resolveVertical` reported only which dimension was empty, while
  `coverageGap` — added for the `--with` front door — could already
  name what would close it. An uncovered dimension is now a
  `RefusalError` built from that same gap, through the one sentence
  builder the front doors use (the gap's tags travel in
  `refusal.missing`, never in the sentence), so the refusal a user runs
  into and the one they are shown ahead of time cannot differ;
  `ResolutionError` is left for an adapter `after` cycle.

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
    how a script says "none" explicitly. An unknown id is refused at
    the front door with the available list spelled out; one the stack
    already carries is set aside with a note (see _"Already there" is
    not an error_). On a composite stack an id goes to the one service
    that can take it, or is named for one as `path:id` (see _A
    product's services take extras of their own when it is created_).
  - **An uncoverable id is refused there too**, rather than reaching
    the resolver's throw after every other question has been asked.
    `keel new --stack=quarkus-cli --with persistence` says what the
    project lacks by the entrypoint's label — _"Persistence needs an
    entrypoint this project does not have: HTTP server — a REST
    endpoint"_ — the fact the menu's pruning states by omission, said
    out loud, and never as a tag (see _Coverage refusals say what is
    missing, not which tag_). `coverageGap(vertical, tags)` is
    `coversFor` with that reason attached; it reports the unmet
    `requires` of the adapter _nearest_ to matching, not of every
    stack shape keel supports.
  - **The extras install in dependency order**, whatever order they are
    named in, each against the tags the ones before it promote,
    because a flat probe would refuse the compositions `--with` exists
    for: `--with containerization,distribution,iac` on a REST stack
    (`iac` is keyed on the `dist.container-image` tag `distribution`
    promotes) plans the same install named in any order (see _`--with`
    names a set, not a sequence_).
  - `NewProjectTarget` carries the list, and `keel.dials` pins it
    like any other dial, so `keel ui` round-trips it as one — the
    Options step's _Also scaffold_ group. `keel.preview` still binds
    the question as `{ kind: 'extraVerticals' }` for a caller that
    leaves the list unset and wants it asked.

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
  `keel add module`, listing what that project can take, and what it
  cannot with the reason. What it
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
    issue, word for word, before the click. `keel.preview`
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

- **The CI provider was asked twice.** `ci` and `distribution` share
  one question — where the repository is hosted — but sticky memory is
  keyed per adapter, so a project taking both verticals was asked
  "CI provider?" once by its `ci/*-pipeline` adapter and again by its
  `distribution/*-container` one. The second answer was then thrown
  away: `distributionProvider` prefers the `ci.*` tag precisely so the
  two can never emit for different hosts. All nine adapters that
  declare the question now name the others in `sharesAnswersWith`, so
  whichever vertical is installed first asks, and the other borrows
  the recorded answer — including in the reverse order, where
  `distribution` runs first.

- **On GitLab, `ci` and `distribution` now share the pipeline file
  instead of racing for it.** GitLab gives a project one
  `.gitlab-ci.yml`, and both verticals write into it — but only
  `distribution` upserted, so installing it first left `ci` refusing
  to overwrite the file (`keel add distribution,ci` under the
  `gitlab-ci` provider), and `keel add ci --reapply` re-wrote the
  whole file, silently dropping the release jobs. Each vertical now
  owns a sentinel-delimited region (`# keel:ci-pipeline:begin` … `:end`
  and `# keel:distribution-pipeline:*`), the same idiom `code-style`
  uses for `.editorconfig`. The two install in either order and emit a
  byte-identical file either way, re-rendering one leaves the other's
  jobs untouched, and a hand-written job outside both regions
  survives. A half-deleted marker pair is refused with the fix in the
  message rather than guessed at.

- **A JVM-flavored image no longer leads to a GraalVM question.** On a
  composed `arch.cli + arch.server-http` stack (`quarkus-cli-rest` and
  its siblings) the `distribution` vertical resolves both
  `quarkus-cli-native` and `jvm-container`, so a user who had just
  answered "Container image flavor? JVM" was asked which native
  targets to cross-compile — and `runtime.graalvm-native` was written
  to the manifest over the top of that answer, which is the very tag
  `jvm-container` reads to decide whether its release pipeline builds
  a native artifact for the Dockerfile to copy. The `containerization`
  vertical now records the flavor either way — `runtime.jvm-image`
  beside `deploy.container-image` for the JVM flavor,
  `runtime.graalvm-native` for native — and `quarkus-cli-native`
  excludes `runtime.jvm-image`. The GraalVM decision is one dial per
  project, asked once, where the flavor was actually chosen. A
  CLI-only project ships native binaries exactly as before, and so
  does a combo that chose the native flavor. A manifest written
  before this release carries no flavor tag, so a brownfield
  `keel add distribution` on one keeps the old behavior until
  `keel add containerization` is re-run — re-record the dial, or add
  `runtime.jvm-image` to the manifest's tags by hand.

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

### Fixed

- **The dev database starts.** `dev/compose.yaml` mounted the
  `db-data` volume at `/var/lib/postgresql/data`, which PostgreSQL 18
  moved: `PGDATA` is now a version-scoped subdirectory and the
  image's entrypoint **refuses to start** when it finds a volume at
  the old path (docker-library/postgres#1259), so
  `docker compose -f dev/compose.yaml up` died on the `db` service
  with `there appears to be PostgreSQL data in /var/lib/postgresql/data
(unused mount/volume)` — and with it the database every HTTP
  stack's `%dev` profile targets. The volume now mounts the image's
  own `VOLUME`, per engine (`/var/lib/postgresql` for PostgreSQL,
  `/var/lib/mysql` for MariaDB).
  - **Upgrading a project scaffolded before this fix**: the old
    volume holds a data directory the new mount point exposes at the
    path the entrypoint rejects. `docker compose -f dev/compose.yaml
down -v` discards it (dev data, by doctrine), and the migrations
    one-shot repopulates the schema on the next `up`.
  - The gap that let it ship is closed too: `tests/e2e/dev-compose.test.ts`
    is the first suite to actually run an emitted `dev/compose.yaml`,
    booting the dev database and querying it. Every other
    docker-using suite reaches its database through Testcontainers,
    which mounts no volume, so the whole e2e grid was green over a
    compose file that could not start. It rides a `dev-compose` CI
    shard of its own, and needs a Docker daemon and no language
    toolchain.

- **The monitoring stack's config files are readable inside their
  containers.** The four `dev/observability/` files the granular stack
  bind-mounts now mount `:ro,z` and are written world-readable. On an
  SELinux host (Fedora, RHEL) an unlabelled bind mount reads as a
  permission denial, so `tempo`, `prometheus` and `otel-collector`
  each exited on `open …: permission denied` while `loki` — the one
  service with no mounted config — came up fine; the `z` relabels the
  mount and is inert everywhere else. The explicit mode covers the
  other half: a `keel new` run under a umask of 077 emitted 0600
  configs, unreadable to the unprivileged users those images run as.
  The `nginx.conf` mounts in the containerization, fullstack and
  spa-deploy compose files carry the same label.

## Releases

- [0.5.0-alpha](docs/releases/CHANGELOG.0.5.0-alpha.md) — 2026-08-09
- [0.4.0-alpha](docs/releases/CHANGELOG.0.4.0-alpha.md) — 2026-06-10 — never tagged or published
- [0.3.0-alpha](docs/releases/CHANGELOG.0.3.0-alpha.md) — 2026-04-26
- [0.2.0-alpha](docs/releases/CHANGELOG.0.2.0-alpha.md) — 2026-04-25
- [0.1.0-alpha.2](docs/releases/CHANGELOG.0.1.0-alpha.2.md) — 2026-04-19 — never tagged or published
- [0.1.0-alpha.1](docs/releases/CHANGELOG.0.1.0-alpha.1.md) — 2026-04-19 — never tagged or published

[Unreleased]: https://github.com/rgoussu-dev/Keel/compare/v0.5.0-alpha...HEAD
