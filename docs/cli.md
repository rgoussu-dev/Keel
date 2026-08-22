# CLI reference

All commands operate on the **current working directory**. There is no
`--global` flag and no path under `$HOME` is ever touched — keel is
[project-scoped by design](../README.md).

```sh
npx @rgoussu.dev/keel <command>   # one-shot
```

The examples below use the short `keel <command>` form. Run them as
`npx @rgoussu.dev/keel <command>`, or install the binary once with
`npm install -g @rgoussu.dev/keel` to have `keel` on PATH.

## `keel new`

Bootstrap a greenfield project from a [stack preset](stacks/README.md).

```sh
keel new --stack=<id> [options]
```

| Option                    | Meaning                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-s, --stack <id>`        | Stack preset id (see the [stack catalog](stacks/README.md)). Defaults to `quarkus-cli`.                                                                                                                                                                                                                                                                              |
| `--layout <layout>`       | Composite stacks only: `monorepo` (default) or `polyrepo`. Prompted when interactive and omitted.                                                                                                                                                                                                                                                                    |
| `--build-system <choice>` | Stacks offering a choice: `gradle` (default) or `maven` on the JVM stacks, `npm` (default) or `pnpm` on the TypeScript stacks. On composite stacks the choice is per service, named as `path=id` pairs, comma-separated: `--build-system backend=maven,frontend=pnpm`. Services left unnamed are prompted when interactive and take their stack's default otherwise. |
| `--module-layout <id>`    | Every single-service stack: `basic` (default, the flat trisection) or `modulith` (one hexagon per bounded context). Prompted when interactive and omitted. Distinct from `--layout`, which is about repositories.                                                                                                                                                    |
| `--with-peer-context`     | Every stack offering `--module-layout=modulith`, which is every single-service stack: also scaffold a second bounded context reaching the first only through its peer seam. On a stack composing both entrypoints the peer is wired into **both** assemblies. Rejected, with the stack named, on a stack whose modulith has no peer context.                         |
| `-y, --yes`               | Non-interactive — use defaults for unanswered questions.                                                                                                                                                                                                                                                                                                             |
| `--dry-run`               | Print the plan without writing any file.                                                                                                                                                                                                                                                                                                                             |
| `--list`                  | List every stack id with its one-line description, then exit — nothing is scaffolded.                                                                                                                                                                                                                                                                                |
| `--set <k=v>`             | Preset an answer as `adapterId:questionId=value` (repeatable).                                                                                                                                                                                                                                                                                                       |

Examples:

```sh
keel new --list                                     # every stack id + description
keel new --stack=quarkus-rest                       # interactive
keel new --stack=spring-rest --build-system maven   # pin the build system
keel new --stack=fullstack --layout polyrepo        # one repo per service
keel new --stack=fullstack --build-system backend=maven,frontend=pnpm  # per-service build systems
keel new --stack=quarkus-rest --module-layout modulith  # modules/ + platform/ + application/
keel new --stack=go-http --yes                      # all defaults, no prompts
keel new --stack=rust-cli --dry-run                 # inspect the plan first
keel new --stack=quarkus-cli-rest                   # one hexagon, a CLI and a REST entrypoint both
```

## `keel add`

Install a [vertical](verticals/README.md) onto an existing keel
project (one that carries a keel manifest — i.e. was scaffolded by
`keel new`).

```sh
keel add <vertical> [options]
```

Available verticals: `vcs`, `walking-skeleton`, `dev-env`,
`dev-container`, `observability`, `persistence`, `gateway`,
`containerization`, `ci`, `distribution`, `iac`, `toolchain`. See
the [compatibility matrix](verticals/README.md#compatibility-matrix)
for which vertical applies to which stack — a vertical whose declared
dimensions cannot be covered on your project **hard-fails with a
message naming the gap** (e.g. `observability` on a CLI project).

| Option        | Meaning                                                            |
| ------------- | ------------------------------------------------------------------ |
| `-y, --yes`   | Non-interactive — defaults for every question.                     |
| `--dry-run`   | Print the plan; write nothing.                                     |
| `--list`      | List every vertical id with its one-line description, then exit.   |
| `--reapply`   | Re-render an installed vertical from its recorded answers.         |
| `--set <k=v>` | Preset an answer (same shape as `keel new`). Not with `--reapply`. |

`keel add --list` needs no existing project — it just prints the
catalog.

Adding an already-installed vertical errors with
`keel.vertical-already-installed` — that is what `--reapply` is for.

### `--reapply`: the update path

`keel add <vertical> --reapply` re-renders an **installed** vertical
from the answers the manifest recorded, which is how a template fix in
keel reaches a project scaffolded before the fix. The posture is
deliberately conservative:

- **Template-owned files** (whole-file contributions) are rewritten to
  the pristine re-render. A byte-identical render is skipped, so the
  plan lists only real changes — and every rewrite is reported as a
  unified diff against your working tree. `--dry-run` shows the same
  diff without writing anything.
- **Patched files** (shared files like build files, which you own) are
  never rewritten. A patch whose re-application changes nothing — the
  guarded style keel's adapters use — passes silently; one that
  _would_ change the file refuses the whole run with
  `keel.reapply-conflict` before anything is committed, because
  without a recorded base a changed result cannot be told apart from a
  double application. Resolve that file by hand, then re-run.
- **Answers are frozen.** Resolution is non-interactive from the
  manifest; combining `--set` with `--reapply` errors with
  `keel.reapply-frozen-answers`. A question the vertical grew since
  the original install resolves to its default and is recorded like
  any first ask.

Reapplying a vertical that is not installed errors with
`keel.vertical-not-installed`. Tags the original install promoted are
re-promoted idempotently (they never double), and the vertical keeps
its original `installedAt`. A three-way merge that preserves your
edits to template-owned files is on the [roadmap](roadmap.md) —
today the diff tells you exactly what an overwrite would replace.

## `keel add module`

Add a **named bounded context** to an existing modulith project.

```sh
keel add module <name> [--consumes <other>] [options]
```

A bounded context is not a vertical, which is why it has a command of
its own: `keel add persistence` names a capability the project either
has or lacks, while a context is a thing with a _name_, and
`keel add bounded-context` would have nowhere to put one.

What lands is a structural shell in the layout your stack already
uses — a contract face, a core with one handler, and a
`user-side/service` seam of its own:

```sh
keel add module ordering                     # a context that consumes nothing
keel add module ordering --consumes greeting # …and a gateway to greeting's seam
keel add module shipping --consumes ordering # contexts compose: any context with a seam
```

**The use case inside is a placeholder and says so.** keel knows the
context's name and nothing about its purpose, so it emits
`<Name>Command` / `<Name>Result` with a doc comment telling you that
renaming it is the first thing to do. What is not a placeholder is
everything around it: the driving port, the rejection this context
owns, the seam's own vocabulary, and the fact that no file in the new
context names another context except through that context's seam.

**`--consumes <other>` is opt-in, and its argument must publish a
seam.** Every context added this way does, from the start — that is
what makes `keel add module shipping --consumes ordering` work without
you building the seam by hand first. The one context that does not is
the one `keel new --with-peer-context` scaffolds: it is a pure
consumer, so it is a legal name and an impossible target, and keel
says so rather than emitting a gateway to nothing.

| Option           | Meaning                                                  |
| ---------------- | -------------------------------------------------------- |
| `--consumes <c>` | Also emit a driven port and a gateway over `<c>`'s seam. |
| `-y, --yes`      | Non-interactive — defaults for every question.           |
| `--dry-run`      | Print the plan; write nothing.                           |

The front door refuses, with a reason, when: the name is not a
lowercase word `[a-z][a-z0-9]*` or is a keyword in one of the target
languages; there is no keel project here; the project uses the flat
`basic` layout, which has no seam for a second context to meet the
first at; this is a composite product root rather than one service;
the name is already taken; `--consumes` names something that does not
exist, is the context being added, or publishes no seam; or the
project's stack has no bounded-context adapter, in which case the
command would otherwise scaffold nothing at all and report success.

Supported on every stack that ships a modulith: the twelve JVM stacks,
`go-cli`/`go-http`/`go-cli-http`, `rust-cli`/`rust-http`/`rust-cli-http`,
`ts-cli`/`ts-http` and `web-components`.

## `keel link`

Record a sibling keel project as a **peer** (both ways), so
peer-conditional adapters — the [gateway seam](verticals/gateway.md) —
resolve on both sides.

```sh
cd my-frontend && keel link ../my-backend
keel add gateway                          # frontend half of the seam
cd ../my-backend && keel add gateway      # backend half (CORS + OpenAPI contract)
```

Each project's manifest records the other's projected tags
(`peer.api.rest`, `peer.ui.spa`); see
[peers in the composition model](composition.md#peer-tags-and-products).

## `keel ui`

Serve the local scaffolder — the same stacks, verticals and questions
as the commands above, as a form with a live file-tree preview. Runs
entirely on your machine; nothing is uploaded.

```sh
keel ui                 # prints http://127.0.0.1:7420/?token=… and blocks
keel ui --port 0        # let the OS pick a free port
```

| Option              | Meaning                                                           |
| ------------------- | ----------------------------------------------------------------- |
| `-p, --port <port>` | Port to bind. Defaults to `7420`; `0` asks the OS for a free one. |
| `--host <host>`     | Loopback interface to bind. Defaults to `127.0.0.1`.              |

Open the printed URL — **the token in it is what authorises the page**
— and stop the server with Ctrl-C. Point it at an empty directory and
it is `keel new`; point it at an existing keel project and it becomes
`keel add` / `keel add module`, offering only what that project can
actually take.

Full reference, including the JSON API and how the loopback port is
protected: [the local scaffolder](ui.md).

## `keel toolchain`

Provision the project's **declared toolchain** — the manifest's
[`toolchain` block](composition.md#the-toolchain-block), written by
[`keel add toolchain`](verticals/toolchain.md). keel is an
orchestrator, never an installer: it renders the chosen provider's
_native_ config file and delegates the installing to that provider's
own idempotent command.

#### The manager dial

Which manager provisions the project is a **choice**, and the choice
list is computed from what the project declared. Every option covers
the whole needs set — a single provider that covers everything, or a
curated **combination** of providers that together do. A partial
choice is never offered (the _coverage invariant_): the persistence
vertical's "no half-installs" rule, applied to choices.

| Provider       | Native file                        | Covers                                  |
| -------------- | ---------------------------------- | --------------------------------------- |
| `mise`         | `mise.toml`                        | every tool in the vocabulary            |
| `asdf`         | `.tool-versions`                   | every tool in the vocabulary            |
| `nvm`          | `.nvmrc`                           | `node` (and `npm`, which ships with it) |
| `corepack`     | `packageManager` in `package.json` | `pnpm`                                  |
| `sdkman`       | `.sdkmanrc`                        | `jdk`, `gradle`, `maven`                |
| `rustup`       | `rust-toolchain.toml`              | `rust`                                  |
| `go-native`    | `toolchain` directive in `go.mod`  | `go`                                    |
| `nvm+corepack` | both of their two files            | the union of theirs                     |

So a JVM project is offered **mise · asdf · sdkman**; a Go project
**mise · asdf · go-native**; a Rust project **mise · asdf · rustup**;
an npm-tagged TypeScript project **mise · asdf · nvm**; a pnpm-tagged
one **mise · asdf · nvm+corepack** — nvm alone cannot reach pnpm, so
it is offered there only inside the combination. The same provider
appearing as a single on one profile and inside a combination on
another is the invariant working as intended, and so is an ecosystem
manager vanishing from a list: sdkman covers the JVM whole and
nothing else, so a project that also declares Node or Go is simply
never offered it.

Three of those records are worth a word each:

- **`sdkman`** is the JVM classic, and `sdk` is a shell function
  rather than a binary — keel reaches it through a login shell that
  sources `sdkman-init.sh`, which is SDKMAN!'s own documented usage.
  `.sdkmanrc` names candidate identifiers (`java=25.0.4-tem`), and
  `sdk env install` installs exactly what it names.
- **`rustup`** needs no activation story at all: `rust-toolchain.toml`
  is honored natively by every `cargo` and `rustc` invocation in the
  directory. The Rust need is pinned as a bare major, because the
  scaffolds track latest stable by construction — and rustup has no
  "series" channel, so keel spells it `channel = "stable"`.
- **`go-native`** is the honest "no manager needed" answer. Since Go
  1.21 the `toolchain` directive in `go.mod` makes any installed Go
  auto-provision the toolchain the module asks for, so keel merges
  that directive in place (the corepack situation — the file belongs
  to the project) and runs nothing at all. That merge is the choice's
  consistency check: `check` reports `go.mod` out of date the moment
  its directive and the block disagree, and `install` writes it back.
  The directive is a _floor_, not a pin — a newer local Go is used as
  is, and only an older one triggers a download.

On a fullstack composite nothing special is needed: each service
answers its own profile's dial through its own manifest, so "sdkman
for the backend, nvm for the frontend" is just two per-service
answers.

The answer is **sticky**: it is recorded in the toolchain block as
one field (a combination is one answer, not two) and followed on
later runs without re-asking. `keel add toolchain --reapply`
refreshes versions and leaves the choice alone. mise is the default
— it heads every list.

#### Prefixes, and the two files that will not take one

The block pins a **major** for the JDK and for Node (`jdk 25`,
`node 22`) — a series, not a release. Most managers take that as it
stands: mise's resolver reads a prefix natively, rustup's `stable` is
a channel, and nvm and corepack are handed something concrete
already. Two do not. asdf documents `.tool-versions` as a **lockfile**
that wants exact versions and forbids `latest`; SDKMAN!'s candidate
identifiers always carry a patch, so `java=25-tem` names nothing
installable.

For those two, keel resolves the prefix **before** it renders, and in
lockfile order:

1. whatever the config already names wins, while it still answers the
   prefix. A lockfile resolves once and then stays put — so `check` is
   not made to flap the day a patch ships upstream, a re-run writes
   nothing, and the steady state costs no process at all;
2. otherwise the **manager** is asked its own way — `asdf latest java
temurin-25`, `sdk list java` — on a first install, or after a pin
   bump moved the series out from under the recorded value;
3. failing both, the prefix renders as it stands and the command says
   so: `Could not resolve a concrete version for: …`. The declaration
   still lands (that is the guarantee), but the manager's own
   installer may refuse the line, and `check` counts it unsatisfied.

keel never invents the patch half — it either reuses what is on disk
or asks the tool that knows. So `.tool-versions` ends up with
`java temurin-25.0.4+7` where the block says `jdk 25`, and `.sdkmanrc`
with `java=25.0.4-tem`.

Bumping the pin from `25` to `26` invalidates the recorded value —
`temurin-25.0.4+7` does not answer `temurin-26` — so the next install
asks the manager again and the lockfile moves once, deliberately.

### `keel toolchain install`

```sh
keel toolchain install                     # asks the dial the first time
keel toolchain install --yes               # takes the default (mise) instead of asking
keel toolchain install --provider=asdf     # pins the answer, replacing any recorded one
```

Renders every member's native file at the project root — plain
ecosystem files that IDEs, images, and colleagues without keel
already understand (the JDK need `jdk@25` is spelled
`java = "temurin-25"` for mise, and `java temurin-25.0.4+7` for asdf,
whose lockfile format is resolved to an exact version first — see
[prefixes](#prefixes-and-the-two-files-that-will-not-take-one); most
tools keep their name and version verbatim) — then runs each
member's own install (`mise trust` + `mise install`;
`asdf plugin add …` + `asdf install`; `nvm install`;
`corepack enable` + `corepack install`; `sdk env install`;
`rustup toolchain install`; and nothing at all for `go-native`,
whose rendered directive _is_ the provisioning). Re-runnable at any
point in the project's life: new laptop, teammate clone, CI runner, pin bump.
An unchanged render writes nothing, and every install invocation is
idempotent by construction.

keel owns those files once you use this command: hand edits are
overwritten on the next run, because the block is the source of
truth. Switching managers later renders the new choice's files and
leaves the old one's where they are — a `.nvmrc` is still a valid
`.nvmrc` — so delete them yourself if you want them gone. (corepack
and `go-native` are the exception in kind, not in rule — they merge
one field into a file the project already owns, `packageManager` in
`package.json` and the `toolchain` directive in `go.mod`, and touch
nothing else in it.) After a keel upgrade,
`keel add toolchain --reapply` refreshes the block to the new pins —
then install again.

When a **manager is absent**, the configs are still rendered and the
command says so loudly — the bootstrap one-liner plus the manual
tool list — and exits 0: the declaration is in place, and the
message tells you how to finish satisfying it. On a combination this
is all-or-nothing: one absent member means no member installs, for
the same reason a partial choice is never offered. Use `check` when
you need an exit code.

Refused with a reason when there is no keel project here
(`keel.not-initialised`), the manifest declares no toolchain block
(`keel.toolchain-not-declared` — run `keel add toolchain` first),
nothing on the dial covers the declaration whole
(`keel.toolchain-uncovered-need`), or the requested (or recorded)
choice does not — `keel.toolchain-choice-unavailable`, naming what
does. That last one is what a project that grew a pnpm need after
choosing nvm gets: a re-choice, never a half-install. A failing
provider invocation surfaces as `keel.toolchain-install-failed`,
carrying the manager's own stderr.

### `keel toolchain check`

```sh
keel toolchain check
```

Reports, without touching anything, whether the declaration is
satisfied: one line per need — `✓` installed, `✗` missing, `?`
unverifiable because its manager is absent — plus whether each
on-disk config still matches a fresh render of the block. A stale
render satisfies yesterday's declaration, so drift counts as
unsatisfied even when every tool it names is installed. Exits 0 when
satisfied, 1 otherwise — the CI-friendly half of the pair.

`check` reads the recorded choice (the default when none is
recorded) and never asks or records one of its own: a query that
prompted would not be one.

## Answers, stickiness, and `--set`

Adapters ask only the questions they need (base package, project name,
git remote, …). Answers are recorded in the manifest — **sticky**
questions (e.g. the vcs answers, the JVM-vs-native image flavor) are
not re-asked on later runs. Any answer can be pre-seeded
non-interactively:

```sh
keel new --stack=quarkus-cli --yes \
  --set walking-skeleton/quarkus-cli-bootstrap:basePackage=com.acme.tool
```

The key format is `adapterId:questionId`; `--dry-run` prints the
questions a plan would ask.
