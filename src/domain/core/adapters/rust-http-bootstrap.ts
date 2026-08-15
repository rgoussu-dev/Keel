/**
 * `walking-skeleton/rust-http-bootstrap` adapter — layers the HTTP
 * deployment unit onto the Rust skeleton: the assembly point (PORT
 * from the environment per 12-factor) and beside it the primary
 * adapter mapping `GET /greet?name=…` → greet command → driving port
 * → JSON per the REST seam contract — `{"greeting": …}`, an absent
 * name defaulting to "world" at the transport boundary — with domain
 * errors rendered as RFC 9457 problem documents and fake-backed
 * `tower::oneshot` adapter tests. Appends the unit's build-and-run
 * instructions to the README.
 *
 * Covers the `entrypoint` dimension under `arch.server-http` — the
 * CLI sibling covers it under `arch.cli`, and a project tagged with
 * both ships both deployment units.
 *
 * **One template tree serves both module layouts**, exactly as the
 * CLI sibling does: `rustLayout` supplies the destination and the
 * `use` prefix of the contract face, and only registration differs —
 * a `[[bin]]` plus dependency lines patched into the single `basic`
 * crate, or a crate of its own under `application/` with a manifest
 * and a workspace member entry. The axum/tokio dependencies follow
 * the unit: under the modulith they belong to the assembly crate, not
 * to the workspace, so no context crate ever compiles against a web
 * framework.
 */

import { RUST_BOOTSTRAP_ID, rustBootstrapAnswers } from './rust-bootstrap.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';
import { addWorkspaceMembers, rustLayout, type RustLayoutPaths } from './rust-module-layout.js';

export const RUST_HTTP_BOOTSTRAP_ID = 'walking-skeleton/rust-http-bootstrap';

const TEMPLATE_ROOT = 'composition/walking-skeleton/rust-http-bootstrap/templates';

/** The delivery typology this adapter assembles. */
const TYPOLOGY = 'http';

const README_MARKER = '\n### http\n';

const readmeSection = (binName: string): string =>
  `${README_MARKER}
\`\`\`sh
cargo build --release
PORT=8080 ./target/release/${binName}
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

const binMarker = (rootFile: string): string => `path = "${rootFile}"`;

const binSection = (binName: string, rootFile: string): string =>
  `
[[bin]]
name = "${binName}"
${binMarker(rootFile)}
`;

export const rustHttpBootstrapAdapter: Adapter = {
  id: RUST_HTTP_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['lang.rust', 'arch.server-http'] },
  after: [RUST_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { projectName, crateName } = rustBootstrapAnswers(ctx.manifest, RUST_HTTP_BOOTSTRAP_ID);
    const layout = rustLayout(ctx.manifest.tags, projectName);
    const assembly = layout.assembly(TYPOLOGY);
    const binName = layout.binName(TYPOLOGY);
    const files = await ctx.templates.render(`${TEMPLATE_ROOT}/unit`, srcDirOf(layout), {
      projectName,
      crateName,
      contractUse: layout.contract.usePath,
    });
    if (layout.layout === 'basic') {
      return {
        files,
        patches: [rootCratePatch(binName, assembly.rootFile), readmePatch(binName)],
      };
    }
    const manifest = await ctx.templates.render(`${TEMPLATE_ROOT}/manifest`, assembly.crate.dir, {
      assemblyCrate: assembly.crate.name,
      binName,
      contractCrate: layout.contract.crate.name,
      contractPath: layout.contract.crate.pathFrom(assembly.crate),
    });
    return {
      files: [...files, ...manifest],
      patches: [membersPatch(assembly.crate.dir), readmePatch(binName)],
    };
  },
};

/**
 * Directory the unit's sources render into — `src/bin/http/` under
 * `basic`, the assembly crate's `src/` under the modulith. Derived
 * from the root file so the two never disagree.
 */
function srcDirOf(layout: RustLayoutPaths): string {
  const rootFile = layout.assembly(TYPOLOGY).rootFile;
  return rootFile.slice(0, rootFile.lastIndexOf('/'));
}

/**
 * Adds the web dependencies and the `[[bin]]` target to the single
 * `basic` crate. Each step is guarded independently: a project
 * carrying both entrypoints runs this after the CLI sibling, and a
 * re-apply must add nothing.
 */
function rootCratePatch(binName: string, rootFile: string): ContributionPatch {
  return {
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
      if (!next.includes(binMarker(rootFile))) {
        next = `${next.trimEnd()}${withEol(`\n${binSection(binName, rootFile)}`, eol)}`;
      }
      return next;
    },
  };
}

/** Registers the assembly crate as a workspace member. */
function membersPatch(dir: string): ContributionPatch {
  return {
    target: 'Cargo.toml',
    apply: (existing) => addWorkspaceMembers(existing, [dir]),
  };
}

function readmePatch(binName: string): ContributionPatch {
  return {
    target: 'README.md',
    apply: (existing) => {
      if (existing.includes(README_MARKER)) return existing;
      return `${existing.trimEnd()}${withEol(`\n${readmeSection(binName)}`, eolOf(existing))}`;
    },
  };
}
