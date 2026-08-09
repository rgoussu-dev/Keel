# Agent conventions — infrastructure

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
