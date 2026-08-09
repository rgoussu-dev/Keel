/**
 * `walking-skeleton/rust-cli-bootstrap` adapter — layers the CLI
 * deployment unit onto the Rust skeleton: `src/bin/cli/main.rs` (the
 * assembly point, wiring the hexagon by hand) and its sibling module
 * `src/bin/cli/app.rs` (the primary adapter mapping flags → greet
 * command → driving port → streams + exit code, with fake-backed
 * adapter tests). Registers the unit as an explicit `[[bin]]` target
 * named after the project and appends its build-and-run instructions
 * to the README.
 *
 * Covers the `entrypoint` dimension under `arch.cli`. The HTTP
 * sibling covers the same dimension under `arch.server-http`; the
 * resolver picks whichever predicates match, and a project tagged
 * with both ships both deployment units — the house Rust reference
 * expects one `src/bin/` directory per deployment unit.
 */

import { RUST_BOOTSTRAP_ID, rustBootstrapAnswers } from './rust-bootstrap.js';
import type { Adapter } from '../../contract/composition.js';

export const RUST_CLI_BOOTSTRAP_ID = 'walking-skeleton/rust-cli-bootstrap';

const TEMPLATE_ID = 'composition/walking-skeleton/rust-cli-bootstrap/templates';

const README_MARKER = '\n### cli\n';

const readmeSection = (projectName: string): string =>
  `${README_MARKER}
\`\`\`sh
cargo build --release
./target/release/${projectName} --name World
\`\`\`
`;

const BIN_MARKER = 'path = "src/bin/cli/main.rs"';

const binSection = (projectName: string): string =>
  `
[[bin]]
name = "${projectName}"
${BIN_MARKER}
`;

export const rustCliBootstrapAdapter: Adapter = {
  id: RUST_CLI_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['lang.rust', 'arch.cli'] },
  after: [RUST_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { projectName, crateName } = rustBootstrapAnswers(ctx.manifest, RUST_CLI_BOOTSTRAP_ID);
    const files = await ctx.templates.render(TEMPLATE_ID, '', { projectName, crateName });
    return {
      files,
      patches: [
        {
          target: 'Cargo.toml',
          apply: (existing) => {
            if (existing.includes(BIN_MARKER)) return existing;
            return `${existing.trimEnd()}\n${binSection(projectName)}`;
          },
        },
        {
          target: 'README.md',
          apply: (existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}\n${readmeSection(projectName)}`;
          },
        },
      ],
    };
  },
};
