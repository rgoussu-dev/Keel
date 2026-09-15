# Product root (keel)

This is the root of a **composite product**: several complete
projects in one workspace, not one project with several folders. Each
service below is its own hexagon, with its own build, its own keel
manifest and its own `AGENTS.md`. keel maintains the indexes between
its sentinel markers and replaces them on re-apply, so keep your own
notes outside them.

<!-- keel:map:begin -->
<!-- keel:map:end -->

## The one rule here

**Work inside a service, under that service's own harness.** Open the
service directory, read its `AGENTS.md`, and run its commands from
there. This document is an index and a run story; it states no
architecture, no test policy and no commit policy, because each
service already states its own and they may legitimately differ — a
JVM backend and a browser frontend do not share a build, a dispatch
seam or a gate.

Nothing is hoisted to this root: no `.claude/settings.json`, no
hooks, no skills. A hook here would run the wrong gate for whichever
service the change is actually in, and a skill here would describe a
build that only one service has. The per-service harnesses are the
whole harness; this root only makes them findable.

Cross-service composition is recorded as `peers` in each service's
manifest, and the peer-conditional adapters (the frontend's REST
gateway, the backend's CORS config) were selected from those facts —
so a change that crosses the seam is two changes, one in each
service, each green on its own gate.

## Running the product

```sh
docker compose up --build
```

One image per deployment unit, built from the `Dockerfile` beside it.
Configuration rides the environment: every `${VAR:-default}` in
`compose.yaml` is a deploy-time knob, `BACKEND_URL` and
`API_BASE_URL` being the two that matter. A frontend change rebuilds
and re-runs only the assets image; nginx never rebuilds.

For the development loop, run each service from its own directory
with the command its own document gives — the compose file is the
composed picture, not the inner loop.
