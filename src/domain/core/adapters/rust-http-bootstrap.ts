/**
 * `walking-skeleton/rust-http-bootstrap` adapter — layers the HTTP
 * deployment unit onto the Rust skeleton: `src/bin/http/main.rs`
 * (the assembly point; PORT from the environment per 12-factor) and
 * its sibling module `src/bin/http/handler.rs` (the primary adapter
 * mapping `GET /greet?name=…` → greet command → driving port → JSON
 * per the REST seam contract — `{"greeting": …}`, an absent name
 * defaulting to "world" at the transport boundary — with domain
 * errors rendered as RFC 9457 problem documents and fake-backed
 * `tower::oneshot` adapter tests). Patches the axum +
 * tokio dependencies into `Cargo.toml`, registers the unit as an
 * explicit `[[bin]]` target named `<project>-http`, and appends its
 * build-and-run instructions to the README.
 *
 * Covers the `entrypoint` dimension under `arch.server-http` — the
 * CLI sibling covers it under `arch.cli`, and a project tagged with
 * both ships both deployment units.
 */

import { RUST_BOOTSTRAP_ID, rustBootstrapAnswers } from './rust-bootstrap.js';
import type { Adapter } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';

export const RUST_HTTP_BOOTSTRAP_ID = 'walking-skeleton/rust-http-bootstrap';

const TEMPLATE_ID = 'composition/walking-skeleton/rust-http-bootstrap/templates';

const README_MARKER = '\n### http\n';

const readmeSection = (projectName: string): string =>
  `${README_MARKER}
\`\`\`sh
cargo build --release
PORT=8080 ./target/release/${projectName}-http
curl 'http://localhost:8080/greet?name=World'
\`\`\`
`;

const DEPENDENCIES_MARKER = '[dependencies]';

const RUNTIME_DEPENDENCIES = `axum = "0.8"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["macros", "net", "rt-multi-thread"] }`;

const DEV_DEPENDENCIES = `
[dev-dependencies]
http-body-util = "0.1"
tower = { version = "0.5", features = ["util"] }
`;

const BIN_MARKER = 'path = "src/bin/http/main.rs"';

const binSection = (projectName: string): string =>
  `
[[bin]]
name = "${projectName}-http"
${BIN_MARKER}
`;

export const rustHttpBootstrapAdapter: Adapter = {
  id: RUST_HTTP_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['lang.rust', 'arch.server-http'] },
  after: [RUST_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { projectName, crateName } = rustBootstrapAnswers(ctx.manifest, RUST_HTTP_BOOTSTRAP_ID);
    const files = await ctx.templates.render(TEMPLATE_ID, '', { crateName });
    return {
      files,
      patches: [
        {
          target: 'Cargo.toml',
          apply: (existing) => {
            const eol = eolOf(existing);
            let next = existing;
            if (!next.includes('axum = ')) {
              next = next.replace(
                DEPENDENCIES_MARKER,
                `${DEPENDENCIES_MARKER}${withEol(`\n${RUNTIME_DEPENDENCIES}`, eol)}`,
              );
            }
            if (!next.includes('[dev-dependencies]')) {
              next = `${next.trimEnd()}${withEol(`\n${DEV_DEPENDENCIES}`, eol)}`;
            }
            if (!next.includes(BIN_MARKER)) {
              next = `${next.trimEnd()}${withEol(`\n${binSection(projectName)}`, eol)}`;
            }
            return next;
          },
        },
        {
          target: 'README.md',
          apply: (existing) => {
            if (existing.includes(README_MARKER)) return existing;
            return `${existing.trimEnd()}${withEol(`\n${readmeSection(projectName)}`, eolOf(existing))}`;
          },
        },
      ],
    };
  },
};
