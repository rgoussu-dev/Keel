/**
 * `walking-skeleton/rust-cli-bootstrap` adapter — layers the CLI
 * deployment unit onto the Rust skeleton: the assembly point wiring
 * the hexagon by hand, and beside it the primary adapter mapping
 * flags → greet command → driving port → streams + exit code, with
 * fake-backed adapter tests. Appends the unit's build-and-run
 * instructions to the README.
 *
 * Covers the `entrypoint` dimension under `arch.cli`. The HTTP
 * sibling covers the same dimension under `arch.server-http`; the
 * resolver picks whichever predicates match, and a project tagged
 * with both ships both deployment units.
 *
 * **One template tree serves both module layouts.** What changes
 * between them is where the unit lands and how it is registered, not
 * what it says: `rustLayout` supplies the destination directory and
 * the `use` prefix of the contract face, so the sources are
 * layout-agnostic text. Registration is the part that genuinely
 * differs —
 *
 * - under `basic` the unit is a `[[bin]]` target of the project's
 *   single crate, appended to the root `Cargo.toml`;
 * - under the modulith it is a **crate of its own** under
 *   `application/`, so it needs a manifest of its own and an entry in
 *   the workspace's `members`.
 *
 * The binary is named identically either way. Renaming somebody's
 * executable is not part of what the layout dial is for.
 */

import { RUST_BOOTSTRAP_ID, rustBootstrapAnswers } from './rust-bootstrap.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';
import { addWorkspaceMembers, rustLayout, type RustLayoutPaths } from './rust-module-layout.js';

export const RUST_CLI_BOOTSTRAP_ID = 'walking-skeleton/rust-cli-bootstrap';

const TEMPLATE_ROOT = 'composition/walking-skeleton/rust-cli-bootstrap/templates';

/** The delivery typology this adapter assembles. */
const TYPOLOGY = 'cli';

const README_MARKER = '\n### cli\n';

const readmeSection = (binName: string): string =>
  `${README_MARKER}
\`\`\`sh
cargo build --release
./target/release/${binName} --name World
\`\`\`
`;

const binMarker = (rootFile: string): string => `path = "${rootFile}"`;

const binSection = (binName: string, rootFile: string): string =>
  `
[[bin]]
name = "${binName}"
${binMarker(rootFile)}
`;

export const rustCliBootstrapAdapter: Adapter = {
  id: RUST_CLI_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['lang.rust', 'arch.cli'] },
  after: [RUST_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { projectName, crateName } = rustBootstrapAnswers(ctx.manifest, RUST_CLI_BOOTSTRAP_ID);
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
        patches: [rootBinPatch(binName, assembly.rootFile), readmePatch(binName)],
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
 * Directory the unit's sources render into — `src/bin/cli/` under
 * `basic`, the assembly crate's `src/` under the modulith. Derived
 * from the root file rather than assembled here, so the two never
 * disagree about where `main.rs` went.
 */
function srcDirOf(layout: RustLayoutPaths): string {
  const rootFile = layout.assembly(TYPOLOGY).rootFile;
  return rootFile.slice(0, rootFile.lastIndexOf('/'));
}

/** Registers the unit as a `[[bin]]` of the single `basic` crate. */
function rootBinPatch(binName: string, rootFile: string): ContributionPatch {
  return {
    target: 'Cargo.toml',
    apply: (existing) => {
      if (existing.includes(binMarker(rootFile))) return existing;
      return `${existing.trimEnd()}${withEol(`\n${binSection(binName, rootFile)}`, eolOf(existing))}`;
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
