/**
 * `agent-harness/rust-claude-kit` adapter — the Claude kit for the
 * Rust stacks. Bin names come from `rustLayout` (`<project>` for the
 * CLI, `<project>-http` for the HTTP shape) and deliberately do not
 * move with the module layout, so the commands hold under `basic`
 * and the modulith alike.
 *
 * The pre-commit hook auto-formats with `cargo fmt`, then runs the
 * family's CI gate (`cargo test --workspace`, which builds first).
 * The modulith note restates the peer-seam rule I.4 decided: Rust
 * does not enforce it, so the addendum must carry it.
 */

import type { Adapter, Ctx } from '../../contract/composition.js';
import { anyProjectName } from '../util.js';
import { moduleLayoutOf } from './module-layout.js';
import {
  claudeKitAdapter,
  renderRunbook,
  runSkillSpec,
  type ClaudeKitFamily,
  type LayerDoc,
  type LifecycleFacts,
  type RunbookCommand,
} from './claude-kit.js';

export const RUST_CLAUDE_KIT_ID = 'agent-harness/rust-claude-kit';

const PROBE = "curl 'http://localhost:8080/greet?name=World'";

function rustFamily(ctx: Ctx): ClaudeKitFamily {
  const tags = ctx.manifest.tags;
  const projectName = anyProjectName(ctx.manifest);
  const cli = tags.includes('arch.cli');
  const http = tags.includes('arch.server-http');
  const modulith = moduleLayoutOf(tags) === 'modulith';

  const verifyCommand = 'cargo test --workspace';
  const httpRun = `PORT=8080 cargo run --bin ${projectName}-http`;
  const cliRun = `cargo run --bin ${projectName} -- --name World`;

  const commands: RunbookCommand[] = [
    { label: 'Build', command: 'cargo build --workspace' },
    { label: 'Test', command: 'cargo test --workspace' },
    { label: 'Format', command: 'cargo fmt' },
    { label: 'Verify (commit gate)', command: verifyCommand },
    ...(http
      ? [
          { label: 'Run (http)', command: httpRun },
          { label: 'Probe', command: PROBE },
        ]
      : []),
    ...(cli ? [{ label: 'Run (cli)', command: cliRun }] : []),
  ];

  const stance =
    'Per-use-case driving-port traits; where one seam is justified, commands are an enum ' +
    'dispatched by one exhaustive `match` — the compiler is the registry, so no runtime registry ' +
    'of trait objects probed via `supports()`. Port traits return the kernel’s `BoxFuture`, never a ' +
    'bare `async fn` in a trait (not dyn-compatible).';

  const units = [...(http ? ['`http`'] : []), ...(cli ? ['`cli`'] : [])].join(', ');
  const bins = [
    ...(http ? [`\`${projectName}-http\``] : []),
    ...(cli ? [`\`${projectName}\``] : []),
  ].join(', ');
  const layout = modulith
    ? [
        '`platform/kernel/` — crate `platform-kernel`: `BoxFuture`, the `Clock` port with its fake and system adapters.',
        '`modules/<ctx>/domain/contract/` — crate `<ctx>-domain-contract`: commands, results, errors, driven port traits (`<Peer>Client`); `modules/<ctx>/domain/core/` — the handlers.',
        '`modules/<ctx>/user-side/service/` — crate `<ctx>-user-side-service`, the peer seam: the only crate a sibling context depends on.',
        '`modules/<ctx>/infra/<peer>-gateway/src/lib.rs` — implements `<ctx>`’s `<Peer>Client` over `<peer>`’s seam crate; other driven adapters sit beside it.',
        `\`application/<unit>/\` — the bin crates (${units}; bins ${bins}): \`src/main.rs\` assembles, \`src/<ctx>.rs\` wires one context’s service and gateways into it.`,
        '`migrations/sql/V<n>__<name>.sql` — schema migrations, once `keel add persistence` installs them.',
        'The seam publishes **only its own DTOs**. Rust does not enforce this (inference lets a domain type flow through), so it holds by review: never add a domain type to a seam crate’s public signatures. When `public-dependency` stabilises, add `public = false` on the seam crate’s `domain-contract` dependency and `#![deny(exported_private_dependencies)]`.',
      ]
    : [
        '`src/domain.rs` + `src/domain/` — the contract face: commands, ports (`clock`, …) and the use cases; the core stays private to it.',
        '`src/infra.rs` + `src/infra/` — driven adapters, the fake beside the real one (`clock_fake`, `clock_sys`, `postgres`).',
        `\`src/bin/<unit>/main.rs\` — the assembly per deployment unit (${units}; bins ${bins}), transport handlers beside it; \`tests/\` — port-level tests.`,
        '`migrations/sql/V<n>__<name>.sql` — schema migrations, once `keel add persistence` installs them.',
      ];

  const runbook = renderRunbook({
    title: `Rust ${http && cli ? 'CLI + HTTP' : http ? 'HTTP' : 'CLI'} (${modulith ? 'modulith' : 'basic'})`,
    commands,
    stance,
    layout,
    notes: [],
  });

  const steps: string[] = [];
  if (http) {
    steps.push(
      `1. Start the server (long-running — run it in the background):

   \`\`\`sh
   ${httpRun}
   \`\`\`

2. Probe the walking skeleton:

   \`\`\`sh
   ${PROBE}
   \`\`\`

   Expect a JSON greeting for \`World\`; stop the server when done.`,
    );
  }
  if (cli) {
    steps.push(
      `${http ? '3' : '1'}. Run the CLI and read its output:

   \`\`\`sh
   ${cliRun}
   \`\`\`

   Expect the greeting for \`World\` on stdout.`,
    );
  }

  const runSkill = runSkillSpec({
    description:
      'Launch this Rust app and check it end to end. Use when asked to run, start, or check the app.',
    body: `# Run ${projectName}\n\n${steps.join('\n\n')}`,
  });

  const newPort =
    'A new port: the trait in the contract, a fake beside the real adapter, and one test run against both — never a mocking crate.';
  const boxFuture =
    'Port traits return `BoxFuture`, never a bare `async fn`: an `async fn` in a trait is not dyn-compatible, and ports are used as `dyn`.';
  const docs: LayerDoc[] = modulith
    ? [
        {
          directory: 'platform',
          title: 'what no context owns',
          description:
            'the kernel crate every bounded context shares: BoxFuture and the Clock port',
          bullets: [
            '`kernel/` — crate `platform-kernel`: `BoxFuture` and the `Clock` port with its fake and system adapters. Nothing context-specific belongs here.',
            boxFuture,
          ],
        },
        {
          directory: 'modules',
          indexes: 'modules',
          title: 'bounded contexts',
          description:
            'one directory of crates per bounded context; peers meet only at user-side/service',
          bullets: [
            '`<ctx>/domain/contract/` — commands, results, errors, driven port traits (`<Peer>Client`), with its tests in `tests/`; `<ctx>/domain/core/` — the handlers; `<ctx>/infra/<x>/` — driven adapters, one crate each.',
            '`<ctx>/user-side/service/` — crate `<ctx>-user-side-service`, the peer seam and the only crate a sibling context depends on; it is its own crate so that dependency is all a peer can reach.',
            'The seam publishes only its own DTOs. Rust does not enforce that — inference lets a domain type flow through — so it holds by review: never put a domain type in a seam crate’s public signatures.',
            `\`<ctx>/infra/<peer>-gateway/\` implements \`<ctx>\`’s \`<Peer>Client\` over \`<peer>\`’s seam crate. ${newPort}`,
          ],
        },
        {
          directory: 'application',
          title: 'assemblies',
          description: 'the bin crates: one per deployment unit, one wiring module per context',
          bullets: [
            '`<unit>/src/main.rs` assembles the unit; `<unit>/src/<ctx>.rs` wires one context’s service and gateways into it. Transport maps to a command and back, with no business logic.',
          ],
        },
      ]
    : [
        {
          directory: 'src/domain',
          title: 'the contract face',
          description: 'commands, ports and use cases; the core stays private to it',
          bullets: [
            '`src/domain.rs` declares the modules; `greet.rs` holds the use case behind `trait Greeter` (`new_greeter()`), `clock.rs` the `Clock` port.',
            boxFuture,
            'Where one seam is justified, commands are one enum matched exhaustively — the compiler is the registry.',
          ],
        },
        {
          directory: 'src/infra',
          title: 'driven adapters',
          description: 'driven adapters, the fake beside the real one',
          bullets: [
            '`clock_fake.rs` ships with the skeleton; `clock_sys` and `postgres` arrive with `keel add persistence`, declared in `src/infra.rs`.',
            newPort,
          ],
        },
        {
          directory: 'tests',
          title: 'port-level tests',
          description: 'integration tests that drive the crate through its public API',
          bullets: [
            'Each file here is its own test crate and sees only the public API (`greet.rs`): drive a use case through its port, on the fakes.',
            '`cargo test --workspace` runs these with the unit tests — the commit gate.',
          ],
        },
      ];

  const lifecycle: LifecycleFacts = {
    addModule: [
      'Every emitted crate is added to the workspace `Cargo.toml` `members` list in the same run. A crate directory outside that list is not built at all — `cargo build` succeeds and never looks at it.',
      '`application/<unit>/src/<ctx>.rs` is the context’s wiring module, and `main.rs` must `mod <ctx>;` it. Rust catches this one: an unreferenced module is a dead file the compiler warns about rather than a handler silently never found.',
      'The gateway crate depends on the peer’s `<peer>-user-side-service` crate and on nothing else of the peer. That single dependency **is** the wall — adding `<peer>-domain-contract` beside it re-merges the two contexts, and cargo will not object.',
      'The seam publishes only its own DTOs, and Rust does not enforce it: inference lets a domain type flow out through a public signature. Read the new seam’s signatures before you call it done.',
      'Port traits return `BoxFuture`, never a bare `async fn` — ports are used as `dyn`, and an `async fn` in a trait is not dyn-compatible.',
    ],
    promote: [
      '`src/domain.rs` + `src/domain/` → `modules/<ctx>/domain/contract/` and `modules/<ctx>/domain/core/`, one crate each; the `Clock` port and `BoxFuture` go to `platform/kernel/`, which belongs to no context.',
      '`src/infra/` → `modules/<ctx>/infra/<x>/`, one crate per adapter, with the fake beside the real one as before.',
      '`src/bin/<unit>/main.rs` → `application/<unit>/src/main.rs`, a bin crate of its own, with one `src/<ctx>.rs` wiring module per context.',
      'The root `Cargo.toml` becomes a workspace: list every new crate under `members`, and let each crate carry its own `Cargo.toml`. `tests/` follows the crate whose public API it drives.',
      'A peer edge is then a `<Peer>Client` trait in your own `domain/contract` plus a `modules/<ctx>/infra/<peer>-gateway/` crate depending on the peer’s seam crate and nothing else.',
    ],
  };

  return {
    runbook,
    runSkill,
    formatCommand: 'cargo fmt',
    verifyCommand,
    layout: modulith ? 'modulith' : 'basic',
    lifecycle,
    docs,
  };
}

export const rustClaudeKitAdapter: Adapter = claudeKitAdapter(
  RUST_CLAUDE_KIT_ID,
  ['lang.rust'],
  rustFamily,
);
