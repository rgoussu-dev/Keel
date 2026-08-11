# `distribution` — how the project ships

Release engineering as a vertical:

```sh
keel add distribution
```

Today it covers **CLI-shaped Quarkus projects on Gradle**: native
binaries via GraalVM, cross-compiled in a GitHub Actions matrix and
published to a GitHub Release on tag push.

## Dimensions & adapters

| Dimension                  | Adapter                           | Predicate                                       |
| -------------------------- | --------------------------------- | ----------------------------------------------- |
| `build`, `release-channel` | `distribution/quarkus-cli-native` | `framework.quarkus` + `arch.cli` + `pkg.gradle` |

What the adapter emits:

- GitHub Actions workflows that **cross-compile the CLI to native
  binaries** via GraalVM — `linux-amd64`, `linux-arm64`,
  `darwin-arm64` (a sticky question tunes the target set) — and
  upload them to a **GitHub Release on tag push**.
- Promotes the `runtime.graalvm-native` tag so future verticals can
  key off it.

## Prerequisites

| Requirement          | When                                                             |
| -------------------- | ---------------------------------------------------------------- |
| none at install time | keel only writes workflow files.                                 |
| A GitHub repository  | The workflows run on GitHub Actions and publish GitHub Releases. |
| nothing locally      | GraalVM runs **in CI**, not on your machine.                     |

## Current limits

Any other shape hard-fails with uncovered dimensions:

- REST/HTTP projects: the container-image sibling (CI-built images
  pushed to a registry on tag push) is
  [roadmap item E](../roadmap.md#e--distribution-for-rest-container-image)
  — meanwhile [`containerization`](containerization.md) covers the
  local image story.
- Go/Rust/TS CLIs: siblings covering the same dimensions under their
  own predicates are the intended growth path.

## Related

- [`containerization`](containerization.md) ·
  [Verticals catalog](README.md) · [Roadmap](../roadmap.md)
