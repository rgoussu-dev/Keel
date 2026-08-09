# domain/kernel

The innermost ring: the sealed bases every business operation builds
on. `Action`/`Command`/`Query` (phantom-typed so dispatch recovers
result types), the `Ok`/`Err` `Result` envelope with `DomainError`,
the `Handler` interface (self-declaring via `supports()`), and the
`Mediator` port.

Depends on **nothing** — not the contract, not node built-ins beyond
the language, not any library. The dependency-cruiser rule
`kernel-depends-on-nothing` enforces it.
