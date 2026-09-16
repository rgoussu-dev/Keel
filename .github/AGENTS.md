# Agent conventions — .github

<!-- keel:purpose: CI jobs, the report-only workflows, release and supply chain, the PR workflow -->

What lives here: the workflows (`workflows/`) and the Dependabot
configuration (`dependabot.yml`). The **e2e grid** the `e2e` job shards
over is documented where the suites are — [`tests/e2e/`](../tests/e2e/AGENTS.md).

## Pull request workflow

keel deviates from the binding spec's pure trunk-based rule (`§6`) for
one reason: contributions land via Claude Code cloud sessions, which
require a feature branch per session and a PR to review the result
before merging to `main`.

- Branch name is assigned by the harness (e.g.
  `claude/<short-slug>-<token>`). Do not create arbitrary branches.
- Every PR targets `main`. Direct pushes to `main` are for
  `chore(release)` tags only.
- Commits inside the branch still follow trunk-based discipline: small,
  logical, each one individually green.
- After merge, the branch is deleted. History on `main` remains linear —
  prefer squash or rebase-merge.

When Claude creates a PR in this repo:

1. **Auto-subscribe** to PR activity with
   `mcp__github__subscribe_pr_activity` immediately after creation. Do
   not ask first.
2. **Check current state**: CI status (`pull_request_read` →
   `get_check_runs`) and review comments (`get_review_comments`).
3. **Address attention items** per the standard rules: fix now if you
   are confident and the change is small; use `AskUserQuestion` if the
   fix is ambiguous or architecturally significant; skip with a note if
   no action is needed (e.g. duplicate, stale).
4. **Reply sparingly** on GitHub — only when a reply is genuinely
   necessary (rejecting a suggestion with reasoning, explaining why
   something is intentional). A pushed fix speaks for itself.
5. **Never** create a PR the user did not explicitly request.

The PR description must include a `## Summary` and a `## Test plan`
checklist. The `Test plan` is a real list of things to verify
post-merge, not a restatement of the changes.

## The two CI jobs

`ci.yml` runs on PRs and pushes to `main`.

- **`verify`** is the fast gate — lint, typecheck, test, build across
  Node 22 and 24; `tests/e2e/` self-skips there, since it is opt-in on
  CI.
- **`e2e`** is the other half, running with `KEEL_RUN_E2E=1` and
  **sharded by toolchain**: 40 `jvm-*` shards (JDK 25 + Gradle 9.7.0,
  plus Maven on every `jvm-modulith-*`, every `jvm-combo-*` and every
  `jvm-add-module-*-maven`), `go` (Go + Docker), `rust` (cargo), `web`
  (npm/pnpm + Chrome), `web-combo` (npm/pnpm) and `dev-compose` (Docker
  alone). Each shard provisions only what its suites probe for. Between
  the two jobs, nothing in the suite is skipped for want of a tool.

The shard matrix names its files explicitly, and that is a hazard with a
guard: a suite in no shard never runs, which looks exactly like a suite
that passed. `tests/ci-workflow.test.ts` parses the workflow and fails
in `verify` when the matrix and `tests/e2e/` disagree — keep it when
editing the matrix; it is the only thing standing between a new suite
and silent non-coverage. Which cells exist and why they are grouped the
way they are: [`tests/e2e/`](../tests/e2e/AGENTS.md).

**The e2e job's JDK and Gradle versions are coupled and neither is
arbitrary.** The emitted JVM projects target release 25; Maven compiles
with whatever JDK runs it, so an older `JAVA_HOME` makes the Maven
suites skip themselves. Gradle would not care — its foojay resolver
provisions a toolchain — except that Gradle 8.x cannot _start_ on JDK
25, and the host `gradle` is what generates the wrapper. Pinning the
host to 9.7.0 (the wrapper's own version) lets one JDK serve both build
systems. Change one, check the other. Both pins live in `mise.toml`, the
one file a workstation, every CI shard and a Claude web session
provision from — `ci.yml` derives each shard's `mise install` list from
the binaries the shard probes for, and `tests/mise-toolchain.test.ts`
holds the file's Gradle to `GRADLE_VERSION` and its tool list to that
mapping.

## The report-only workflows

Three workflows run outside the PR gate on purpose. None of them may
become a gate without the threshold that would make a red run
actionable.

- **`mutation.yml`** runs the `src/domain` mutation suite
  (`pnpm test:mutation`) on every push to `main` — incremental, so only
  mutants whose code or covering tests changed are retested — plus a
  weekly full run and on dispatch. Report-only and deliberately absent
  from PRs: a full run is hours on a runner, no fast gate absorbs that,
  and with `thresholds.break` null there is nothing for a PR to be gated
  on. The incremental state rides the actions cache under an always-save
  key; the HTML report is a run artifact. Moving onto PRs comes with the
  break threshold, once the baseline settles.
- **`version-currency.yml`** runs the opt-in suite under `tests/currency/`
  (`KEEL_RUN_CURRENCY=1`) weekly to compare each entry of
  `assets/composition/version-pins.json` against its upstream latest
  stable; a red run is the drift report, deliberately never a PR gate.
  The registry ↔ template rule it serves lives in
  [`assets/`](../assets/AGENTS.md).
- **`harness-evals.yml`** runs the agent-harness evals (`evals/`),
  report-only and never a PR gate — the `mutation.yml` posture, and then
  some: a task campaign spawns fifteen real agent sessions, each ending
  in a real build. Its `solvable` job is weekly and needs no key: it
  proves every task case's reference `solve.sh` still turns a red oracle
  green, which is the drift guard between the cases and the templates.
  Its `campaign` job is dispatch-only and opt-in. Two dispatches, one
  per harness variant, make an A/B; `evals/ab.mjs` pairs the benchmarks.
  See `docs/development.md` → Harness evals.

## Release and supply chain

- **`release.yml`** runs on `v*` tag push — verifies the tag matches
  `package.json`, verifies `docs/releases/CHANGELOG.<version>.md` exists
  (a tag pushed without the changelog cut refuses to publish), reruns
  verification, publishes to npm with provenance, creates a GitHub
  Release whose body is that changelog file plus auto-generated notes.
  Dist-tag is derived from the prerelease identifier: `alpha` → `alpha`,
  `beta` → `beta`, `rc` → `next`, none → `latest`; unknown identifiers
  are a hard error.
- Third-party actions are pinned to full commit SHAs with a `# vX.Y.Z`
  comment for supply-chain integrity. Dependabot (`dependabot.yml`)
  proposes grouped weekly updates, and covers this repo's own
  dependencies only — the emitted templates' pins have their own
  currency loop, above.
- Secrets required: `NPM_TOKEN` for the release. The evals workflow's
  `campaign` job additionally needs the key of whichever driver it runs —
  `ANTHROPIC_API_KEY` for `claude-code`, `OPENAI_API_KEY` for `codex` —
  and nothing else in CI reads either. Provenance is enabled via the
  release workflow's `id-token: write` permission.

To cut a release: bump `package.json`, run
`node scripts/cut-changelog.mjs X.Y.Z`, commit the three files as
`chore(release): vX.Y.Z`, tag `vX.Y.Z`, push the tag. The workflow does
the rest. Full procedure: `docs/release.md`.
