# Agent conventions — infrastructure

<!-- keel:purpose: one directory per port, real adapter and canonical fake side by side -->

What lives here: one directory per port, the real adapter and its
canonical fake side by side — `tree/`, `prompt/`, `manifest/`,
`template/`, `process/`, `commons/`, `registry/`. `registry/` finds and
imports a project's plugins; `template/` also holds the router that
sends `plugin:` ids to their assets.

- Zero business logic. An adapter translates between a port and one
  technology; decisions belong in `domain/core`.
- Never import `domain/core` or `application/`, and never a sibling
  adapter directory (`commons` included) — shared behaviour belongs
  behind a port.
- Every new port implementation ships with its fake in the same
  directory, and the fake is the canonical reference implementation
  of the contract: tests everywhere program against it.
- Adapters are integration-tested against their real technology on
  their own terms (see `tests/infrastructure/`); no contract tests
  against the domain.
