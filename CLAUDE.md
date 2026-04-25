# keel — contributor guide for Claude

This is the source repository for `@rgoussu.dev/keel`, the universal Claude
Code workflow kit. Everything in this file applies to **working on keel
itself**. Projects that _consume_ keel get a different CLAUDE.md (see
[`assets/project/CLAUDE.md`](assets/project/CLAUDE.md)).

This file lives at the project root because keel is **project-scoped**: it
installs only into `<project>/.claude/`, never into the user's home
directory. Both this contributor guide and the consumer-facing binding
spec are read by Claude Code from the repo itself.

---

## 1. Binding spec

The universal engineering conventions are defined in
[`assets/project/CLAUDE.md`](assets/project/CLAUDE.md) — the same file
`keel install` copies into `<project>/.claude/CLAUDE.md` for consumers.

**keel dogfoods those conventions.** Any change to this repo must conform to
that document:

- Hexagonal architecture, dependency rule enforced.
- Command/Query + Mediator for business logic; handlers self-declare via
  `supports()`, never inject a `Map`.
- Tests = Scenario + Factory + port interface; fakes, never mocks.
- Walking skeleton first. IaC via OpenTofu.
- XP + SOLID + 12-Factor. Always latest stable.
- Public-API docs (TSDoc here); no comments on private code unless the
  "why" is non-obvious.

Read that file when in doubt. The rest of this document lists the
**repo-specific additions and exceptions** that apply to keel itself.

---

## 2. Exception: feature branches and PRs

The universal spec (`§6`) mandates pure trunk-based development with no
branches and no PRs. **keel deviates** for one reason: contributions land via
Claude Code cloud sessions, which require a feature branch per session and a
PR to review the result before merging to `main`.

Rules for this deviation:

- Branch name is assigned by the harness (e.g.
  `claude/<short-slug>-<token>`). Do not create arbitrary branches.
- Every PR targets `main`. Direct pushes to `main` are for `chore(release)`
  tags only.
- Commits inside the branch still follow trunk-based discipline: small,
  logical, each one individually green.
- After merge, the branch is deleted. History on `main` remains linear —
  prefer squash or rebase-merge.

Everything else in `§6` (Conventional Commits, commit discipline, "Done
means…") applies unchanged.

---

## 3. Commit conventions

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/). Types
used in this repo:

| Type       | When                                         |
| ---------- | -------------------------------------------- |
| `feat`     | user-visible feature or new schematic        |
| `fix`      | bug fix                                      |
| `refactor` | internal change, no behavior change          |
| `docs`     | README / CHANGELOG / CLAUDE.md / inline docs |
| `test`     | test-only changes                            |
| `chore`    | tooling, deps, housekeeping                  |
| `ci`       | workflow / pipeline changes                  |
| `build`    | build config, packaging, release engineering |
| `perf`     | performance                                  |

Scopes are optional but encouraged: `fix(engine): …`, `feat(schematics): …`.

One commit = one logical unit. Never mix refactor + feature + fix. Every
commit must pass `pnpm lint && pnpm typecheck && pnpm test` on its own.

---

## 4. Pull request workflow

When Claude creates a PR in this repo:

1. **Auto-subscribe** to PR activity with `mcp__github__subscribe_pr_activity`
   immediately after creation. Do not ask first.
2. **Check current state**: CI status (`pull_request_read` →
   `get_check_runs`) and review comments (`get_review_comments`).
3. **Address attention items** per the standard rules:
   - Fix now if you are confident and the change is small.
   - Use `AskUserQuestion` if the fix is ambiguous or architecturally
     significant.
   - Skip with a note if no action is needed (e.g. duplicate, stale).
4. **Reply sparingly** on GitHub — only when a reply is genuinely necessary
   (rejecting a suggestion with reasoning, explaining why something is
   intentional). A pushed fix speaks for itself.
5. **Never** create a PR the user did not explicitly request.

The PR description must include a `## Summary` and a `## Test plan`
checklist. The `Test plan` is a real list of things to verify post-merge,
not a restatement of the changes.

---

## 5. Dev workflow

Requirements: Node 20+, pnpm 9+.

```sh
pnpm install
pnpm lint          # eslint (flat config, src + tests) + prettier --check .
pnpm typecheck     # tsc --noEmit
pnpm test          # vitest run
pnpm test:watch    # vitest watch
pnpm build         # tsc -p tsconfig.build.json → dist/
pnpm format        # prettier --write .
pnpm format:check  # prettier --check .
```

`pnpm lint` covers both eslint and prettier, so formatting drift fails the
same gate as code-style rules. A Claude `PreToolUse` hook
(`.claude/hooks/pre-commit-format.sh`) runs `pnpm format` and re-stages any
previously-staged files before every Claude-issued `git commit`, then
verifies `pnpm lint`. That means you almost never need to run `pnpm format`
by hand; if lint fails after the hook's auto-correct, it blocks the commit
and surfaces the error.

Before claiming a task done: run `pnpm lint`, `pnpm typecheck`, and
`pnpm test`. If the environment prevents running them, say so explicitly
rather than asserting success.

The CLI entry is `bin/keel.js`, which loads `dist/cli/main.js`. Build before
trying the CLI locally.

---

## 6. Repository layout

```
src/
  cli/           # commander entry points
  engine/        # Tree, templates, context — the schematics engine
  installer/     # install / update / doctor / plan
  manifest/      # .keel-manifest.json
  schematics/    # port, scenario, walking-skeleton
  util/
assets/
  project/       # → <project>/.claude/ (CLAUDE.md, settings, hooks,
                 #   commands, agents, skills, conventions — the kit)
  schematics/    # schematic templates (ejs)
tests/           # vitest, Scenario + Factory + fakes
bin/keel.js      # npm bin entry
```

The source tree mirrors the hexagonal spec: `engine/` is a port (Tree,
Schematic, Context interfaces in `types.ts`) with `homegrown.ts` as the
default adapter. Alternative adapters (Plop, Nx) would ship as separate
packages; they do **not** go under `src/engine/`.

---

## 7. Testing approach

- Vitest, run via `pnpm test`. Test files live under `tests/` mirroring
  the `src/` structure.
- Follow the Scenario + Factory + port pattern from
  `assets/project/CLAUDE.md §3`. No mocking libraries — build fakes
  directly.
- Every public API change is accompanied by a test change.
- Mutation testing is on the roadmap; not yet wired in this repo.

---

## 8. Documentation policy

- **README.md**: quickstart for consumers (`npx @rgoussu.dev/keel …`),
  development section for contributors, release process for maintainers.
- **CHANGELOG.md**: [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).
  Every user-visible change goes under `[Unreleased]` with the appropriate
  category (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`,
  `Security`). At release time, `[Unreleased]` is renamed to
  `[x.y.z] — YYYY-MM-DD` and a new empty `[Unreleased]` is added. Link
  references at the bottom compare against the previous tag.
- **BRAINSTORM.md**: in-progress design notes. Not authoritative. Do not
  treat it as a source of truth for behavior — only `assets/project/CLAUDE.md`
  and code are.
- **CLAUDE.md** (this file): conventions for contributors. Update when the
  workflow itself changes.
- **Public API docs**: TSDoc `/** … */` on every exported symbol in `src/`.

---

## 9. CI and release

- `.github/workflows/ci.yml` runs on PRs and pushes to `main` — lint,
  typecheck, test, build across Node 20 and 22.
- `.github/workflows/release.yml` runs on `v*` tag push — verifies the tag
  matches `package.json`, reruns verification, publishes to npm with
  provenance, creates a GitHub Release. Dist-tag is derived from the
  prerelease identifier: `alpha`, `beta`, `rc` → `next`, none → `latest`;
  unknown identifiers are a hard error.
- Third-party actions are pinned to full commit SHAs with a `# vX.Y.Z`
  comment for supply-chain integrity. Dependabot
  (`.github/dependabot.yml`) proposes grouped weekly updates.
- Secrets required: `NPM_TOKEN`. Provenance is enabled via the workflow's
  `id-token: write` permission.

To cut a release: bump `package.json`, move `[Unreleased]` in
`CHANGELOG.md` to a dated heading, commit as `chore(release): vX.Y.Z`, tag
`vX.Y.Z`, push the tag. The workflow does the rest.
