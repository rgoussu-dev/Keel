/**
 * `walking-skeleton/rust-claude-kit` adapter — the Claude kit for the
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
  type RunbookCommand,
} from './claude-kit.js';

export const RUST_CLAUDE_KIT_ID = 'walking-skeleton/rust-claude-kit';

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

  return { runbook, runSkill, formatCommand: 'cargo fmt', verifyCommand };
}

export const rustClaudeKitAdapter: Adapter = claudeKitAdapter(
  RUST_CLAUDE_KIT_ID,
  ['lang.rust'],
  rustFamily,
);
