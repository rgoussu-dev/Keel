# Agent conventions — domain/kernel

<!-- keel:purpose: Action/Command/Query, Result, Handler, Mediator; depends on nothing -->

What lives here: `Action`/`Command`/`Query`, `Result`, `Handler`,
`Mediator` — the vocabulary every other layer speaks. It depends on
nothing.

- Nothing in here may import from any other layer or any package.
- New abstractions enter the kernel only when a second concrete use
  exists; one-off needs belong in `domain/contract`.
- Every export carries TSDoc. Changes here ripple through every
  handler and adapter — treat the kernel as frozen API.
