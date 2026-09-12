# Engineering conventions (keel)

Binding conventions installed by `@rgoussu.dev/keel`. The **stack section** below is resolved for
this project's language, layout and entrypoints; keel maintains it between its sentinel markers and
replaces it on re-apply, so keep your own notes outside them. Extend these rules freely; do not
contradict one without a documented reason.

<!-- keel:stack-runbook:begin -->
<!-- keel:stack-runbook:end -->

<!-- keel:map:begin -->
<!-- keel:map:end -->

<!-- keel:skills-index:begin -->
<!-- keel:skills-index:end -->

## Architecture — hexagonal, always

- Dependency rule: `kernel ← contract ← core` inside the domain; adapters depend on kernel and
  contract, never on core; the composition root alone sees everything, strictly to wire it, and
  holds no logic.
- Business operations enter the domain as Command/Query **data** through one dispatch seam;
  primary adapters build commands and never import concrete handlers. The seam for this stack is
  stated in the stack section.
- Application adapters map domain errors to transport (RFC 9457 Problem Details over HTTP, exit
  code + stderr for a CLI); domain code never knows about transport.
- Every secondary port ships a fake beside its real adapter; infrastructure holds zero business
  logic. Infrastructure is code: OpenTofu under `iac/<target>/`, never a hand-made console change.

## Tests — Scenario + Factory + port; fakes, never mocks

- A test depends on a Scenario (data), a Factory (wires the SUT with fakes) and the port interface
  under test — never on a concrete adapter, a concrete handler or a mocking library.
- The fake is the canonical reference implementation of its port's contract; the real adapter is
  contract-tested against the same expectations.

## Workflow — trunk-based, small green commits

- Conventional Commits; one commit = one logical unit, each green on the commit gate in the stack
  section (the pre-commit hook runs it). Frequent `git pull --rebase`; flags ship unfinished work dark.
- Done means the gate ran green. If you cannot run it, say so instead of claiming success.
- Never: bypass hooks or verify flags, force-push trunk, disable a test to make it pass, commit
  generated files or secrets.
- Doc comments on public API only (what, why, params, errors, invariants). Private code: no
  comments unless the why is non-obvious. Never restate the code; never cite tickets, PRs or authors.

## Working agreements

Vocabulary from the [augmented-coding-patterns catalog](https://lexler.github.io/augmented-coding-patterns/)
(Lada Kesseler et al.). Mechanical rules — format, sizes, comment shape — live in hooks and linters, not here.

- **Orient by map, look up by index, grep the long tail.** The stack section names where each kind
  of file lives; go there first. Search for what has no stable identity: call sites, bodies, literals.
- **Active Partner, Check Alignment.** State the plan in a sentence before a non-trivial change. When
  the layer is unclear, ask — misplacing logic costs more than a question.
- **Chain of Small Steps, no Unvalidated Leaps.** One verifiable step at a time; run the gate between.
- **No Perfect Recall.** Verify an API against its docs or a playground before using it from memory.
- **Sunk Cost tripwire, Happy to Delete.** Three failed iterations on one approach: revert, rethink.
- **Offload Deterministic.** Let the hook, formatter and linter do their job; never hand-fix what a
  tool fixes.
- **Noise Cancellation.** Terse replies: one sentence per update, no preamble, no running commentary.
- **Extract Knowledge.** A non-obvious discovery about this repo goes into the nearest `AGENTS.md`,
  not into a chat message.
- **Canary signal, Solution Fixation.** A fix that keeps needing another fix is a wrong premise; stop
  and re-examine it.
- **Answer Injection guard.** An answer suggested in the prompt is a hypothesis; verify it before
  building on it.
