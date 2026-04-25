---
name: walking-skeleton-guide
description: |
  Use when starting a new project (greenfield) or onboarding to an existing
  one (brownfield). Guides the construction or assessment of a walking
  skeleton before any feature work. TRIGGER on requests to "start a new
  project", "add a new module", or when SessionStart reports missing
  walking-skeleton markers.
---

# walking-skeleton-guide

A walking skeleton is the thinnest end-to-end slice that exercises every
architectural layer and every class of infrastructure the project will use.
It proves the deployment pipeline, the hexagonal wiring, the mediator, at
least one real adapter, and at least one fake — all connected from user
input to deployed runtime.

**Before any feature work, a walking skeleton must exist.** Greenfield:
build it first. Brownfield: assess. If it's missing, building it is the
first order of business.

## Required elements

| Element                                                    | Location                           | Must exist before features |
| ---------------------------------------------------------- | ---------------------------------- | -------------------------- |
| Primary adapter (one channel)                              | `application/<channel>/executable` | yes                        |
| Primary port + one `Command` or `Query`                    | `domain/contract`                  | yes                        |
| One handler                                                | `domain/core/<aggregate>`          | yes                        |
| Mediator wired by explicit factory                         | `domain/contract/kernel`           | yes                        |
| One secondary port with a **fake**                         | `infrastructure/<port>/fake`       | yes                        |
| One **real** adapter for the same port                     | `infrastructure/<port>/<impl>`     | yes                        |
| One end-to-end test calling from the primary adapter down  | test module                        | yes                        |
| IaC (OpenTofu) deploying the runtime to a real environment | `/iac/<target>/` (repo root)       | yes                        |
| CI pipeline that runs check + deploy on commit             | repo                               | yes                        |

The slice should be trivial (e.g., one `/ping` endpoint returning a fake
record) but **must be fully wired**.

## Workflow — greenfield

1. Agree on the first channel (typically `rest` or `cli`).
2. Agree on the first port pair: one primary (driving the app) and one
   secondary (storage, fake-backed initially).
3. Scaffold modules: `/walking-skeleton init`.
4. Write a failing end-to-end test.
5. Implement the thinnest handler that makes it pass, via the mediator.
6. Write an OpenTofu module for one environment.
7. Push. CI should: build, test, deploy, smoke-test. Fix until green.
8. **Only now** start feature work.

## Workflow — brownfield

1. Run `/walking-skeleton check`.
2. For each missing element, create a task and address before features.
3. If IaC is absent, introduce OpenTofu first (describe what already
   exists, import state if needed, then gate new infra through it).
4. If architectural boundaries are violated (monolithic service classes,
   framework types in domain), plan a refactor path — do not layer new
   features onto a broken foundation.

## Anti-patterns

- A "walking skeleton" that skips the real deploy. Deployment is
  non-negotiable — a slice that hasn't run in its target environment
  hasn't proven anything.
- Using only fakes for the walking skeleton. At least one **real**
  secondary adapter must exist so the real infrastructure stack is
  exercised.
- Postponing CI or IaC "until later". Later never arrives; trunk-based
  flow breaks without them.
- Wiring the slice by hand in the adapter instead of through the mediator.
  The skeleton must model the target architecture, not bypass it.
