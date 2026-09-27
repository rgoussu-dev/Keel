/**
 * The CLI binary `rust-cli-bootstrap` registers in the single `basic`
 * crate's `Cargo.toml`, at its rank (`rank.ts`): one run installs the
 * CLI before the HTTP unit, so its `[[bin]]` follows the dependencies
 * and precedes the HTTP unit's `[dev-dependencies]` and `[[bin]]`; one
 * arriving on an HTTP project in a later run lands there too.
 *
 * **Scenario.** The crate manifest as one run writes it — the seed, the
 * CLI's patch, the HTTP unit's, observability's — against the same
 * file where the CLI arrives last; the HTTP unit's binary with no
 * `[dev-dependencies]` above it; and the seed alone, CRLF, and the
 * patch over its own result.
 *
 * **Factory.** Each adapter's contribution under a basic-layout
 * CLI + HTTP project's tags (`makeCtx`, the real templates), its
 * `Cargo.toml` patch, or its file, read out of it.
 *
 * **Port.** The patch's `apply`.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import type { Adapter, ContributionPatch } from '../../../../src/domain/contract/composition.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import {
  rustBootstrapAdapter,
  RUST_BOOTSTRAP_ID,
} from '../../../../src/domain/core/adapters/rust-bootstrap.js';
import { rustCliBootstrapAdapter } from '../../../../src/domain/core/adapters/rust-cli-bootstrap.js';
import { rustHttpBootstrapAdapter } from '../../../../src/domain/core/adapters/rust-http-bootstrap.js';
import { rustObservabilityAdapter } from '../../../../src/domain/core/adapters/rust-observability.js';
import { makeCtx } from '../../../../src/domain/core/apply.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';

const TAGS = ['lang.rust', 'pkg.cargo', 'arch.hexagonal', 'arch.cli', 'arch.server-http'];

async function contributionOf(adapter: Adapter, answers: Record<string, string> = {}) {
  const manifest = {
    ...emptyManifestV2('2026-09-25T00:00:00Z', '0.0.0-test'),
    tags: TAGS,
    answers: { [RUST_BOOTSTRAP_ID]: { projectName: 'tool' } },
  };
  return adapter.contribute(
    makeCtx(adapter, answers, {
      manifest,
      logger: new FakeLogger(),
      cwd: '/unused',
      templates: ejsTemplateSource,
      processes: new FakeProcessRunner(),
    }),
  );
}

async function cargoPatch(adapter: Adapter): Promise<ContributionPatch> {
  const patch = (await contributionOf(adapter)).patches?.find((p) => p.target === 'Cargo.toml');
  if (patch === undefined) throw new Error(`${adapter.id}: no Cargo.toml patch`);
  return patch;
}

type Writer = 'cli' | 'http' | 'observability';

/** The bootstrap's `Cargo.toml`, before any unit registers. */
let seed: string;
let writers: Readonly<Record<Writer, ContributionPatch>>;

beforeAll(async () => {
  const bootstrap = await contributionOf(rustBootstrapAdapter, { projectName: 'tool' });
  seed = bootstrap.files?.find((f) => f.path === 'Cargo.toml')?.content.toString() ?? '';
  writers = {
    cli: await cargoPatch(rustCliBootstrapAdapter),
    http: await cargoPatch(rustHttpBootstrapAdapter),
    observability: await cargoPatch(rustObservabilityAdapter),
  };
});

/** The crate manifest after each writer's patch, in `order`. */
const after = (order: readonly Writer[], from = seed): string =>
  order.reduce((text, writer) => writers[writer].apply(text), from);

const CLI_BIN = '[[bin]]\nname = "tool"\npath = "src/bin/cli/main.rs"\n';

describe("the basic crate's CLI binary", () => {
  const oneRun = (): string => after(['cli', 'http', 'observability']);

  it('follows the dependencies and precedes the HTTP unit in one run', () => {
    const cli = oneRun().indexOf(CLI_BIN);
    expect(cli).toBeGreaterThan(oneRun().indexOf('[dependencies]'));
    expect(cli).toBeLessThan(oneRun().indexOf('[dev-dependencies]'));
  });

  it('is appended to the seed as it always was', () => {
    expect(after(['cli'])).toBe(`${seed.trimEnd()}\n\n${CLI_BIN}`);
  });

  it('arriving on an HTTP project, lands where one run puts it', () => {
    expect(after(['http', 'observability', 'cli'])).toBe(oneRun());
    expect(after(['http', 'cli', 'observability'])).toBe(oneRun());
  });

  it('goes above the HTTP binary where the user took out its dev-dependencies', () => {
    const http = after(['http']).replace(/\[dev-dependencies\]\n[\s\S]*?\n\n/, '');
    expect(writers.cli.apply(http)).toBe(http.replace('[[bin]]\n', `${CLI_BIN}\n[[bin]]\n`));
  });

  it('works on a CRLF manifest in its own line endings', () => {
    const crlf = (text: string): string => text.replace(/\n/g, '\r\n');
    expect(after(['http', 'observability', 'cli'], crlf(seed))).toBe(crlf(oneRun()));
  });

  it('is its own fixed point', () => {
    expect(writers.cli.apply(oneRun())).toBe(oneRun());
  });

  it('ranks a table header only on a line of its own', () => {
    const commented = `${seed.trimEnd()}\n# [[bin]] tables go below\n`;
    expect(writers.cli.apply(commented)).toBe(`${commented.trimEnd()}\n\n${CLI_BIN}`);
  });
});
