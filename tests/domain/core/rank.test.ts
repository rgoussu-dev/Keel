/**
 * The rank rule (`src/domain/core/rank.ts`): an entry goes immediately
 * before the first existing entry ranked strictly above it, and is
 * appended as before when none is — so a README section that arrives
 * in a later run lands where one run naming it puts it.
 *
 * Each case builds a README the way its writers do: the seed, then each
 * section appended in the order one run installs it, then a section
 * that arrives later placed by the rule behind the marker guard every
 * caller keeps. Beside the rule, the guard on the one rank the tags
 * decide (DR1): `Dev container` follows the dev environment exactly
 * where the presets install `dev-env` before `dev-container`.
 */

import { describe, expect, it } from 'vitest';
import type { Tag } from '../../../src/domain/contract/tags.js';
import {
  placeReadmeSection,
  rankedIndex,
  readmeSectionRank,
} from '../../../src/domain/core/rank.js';
import { shippedRegistry } from '../../../src/domain/core/registry.js';
import { devContainerVertical } from '../../../src/domain/core/verticals/dev-container.js';
import { devEnvVertical } from '../../../src/domain/core/verticals/dev-env.js';
import { eolOf, withEol } from '../../../src/domain/core/util.js';

const HTTP: readonly Tag[] = ['lang.go', 'arch.hexagonal', 'arch.server-http'];
const CLI: readonly Tag[] = ['lang.go', 'arch.hexagonal', 'arch.cli'];

/** A keel README's seed: its sections follow the last `## ` line. */
const SEED = '# demo\n\n## Layout\n\nhexagonal\n\n## Test\n\n```sh\ngo test ./...\n```\n';

/** A section as its writer authors it: its marker, then its body. */
const section = (heading: string): string => `\n### ${heading}\n\nAbout ${heading}.\n`;

/** How every writer added its section before the rule: at the end. */
const append = (text: string, heading: string): string => `${text.trimEnd()}\n${section(heading)}`;

/** One run: each section appended in the order the run installs it. */
const oneRun = (headings: readonly string[], seed = SEED): string => headings.reduce(append, seed);

/** A writer's patch: its marker guard, in the file's line endings, then the rule. */
const place =
  (heading: string, tags: readonly Tag[]) =>
  (text: string): string =>
    text.includes(withEol(`\n### ${heading}\n`, eolOf(text)))
      ? text
      : placeReadmeSection(text, section(heading), tags);

describe('rankedIndex', () => {
  it('names the first entry ranked strictly above, passing unranked lines and equal ranks', () => {
    expect(rankedIndex([10, undefined, 20, 35, 35, 60], 35)).toBe(5);
    expect(rankedIndex([10, undefined, 20, 35, 35, 60], 20)).toBe(3);
    expect(rankedIndex([undefined, 40], 25)).toBe(1);
  });

  it('reads the entries in file order, so the first ranked above wins over a lower one after it', () => {
    expect(rankedIndex([60, 20], 50)).toBe(0);
    expect(rankedIndex([20, 60, 10], 30)).toBe(1);
  });

  it('is -1 when nothing ranks above, and on no entry at all', () => {
    expect(rankedIndex([10, 20, 60], 60)).toBe(-1);
    expect(rankedIndex([undefined, undefined], 10)).toBe(-1);
    expect(rankedIndex([], 10)).toBe(-1);
  });
});

describe('placeReadmeSection', () => {
  it('appends exactly as before when nothing ranks above the section', () => {
    const before = oneRun(['cli', 'Dev container']);
    expect(placeReadmeSection(before, section('Toolchain'), CLI)).toBe(append(before, 'Toolchain'));
    expect(placeReadmeSection(before, section('Extras of a plugin'), CLI)).toBe(
      append(before, 'Extras of a plugin'),
    );
  });

  it('puts a later arrival where one run puts it', () => {
    expect(place('Persistence', HTTP)(oneRun(['http', 'Toolchain']))).toBe(
      oneRun(['http', 'Persistence', 'Toolchain']),
    );
    expect(place('Dev environment', CLI)(oneRun(['cli', 'Dev container', 'Toolchain']))).toBe(
      oneRun(['cli', 'Dev container', 'Dev environment', 'Toolchain']),
    );
    expect(place('cli', HTTP)(oneRun(['http', 'Dev environment', 'Dev container']))).toBe(
      oneRun(['cli', 'http', 'Dev environment', 'Dev container']),
    );
  });

  it('ranks the dev container by the tags: after the dev environment on HTTP, before it elsewhere', () => {
    const grown = ['Dev environment', 'Monitoring stack', 'Observability']
      .map((heading) => place(heading, HTTP))
      .reduce((text, patch) => patch(text), oneRun(['cli', 'Dev container']));
    expect(grown).toBe(
      oneRun(['cli', 'Dev environment', 'Monitoring stack', 'Observability', 'Dev container']),
    );
    expect(place('Dev environment', CLI)(oneRun(['cli', 'Dev container']))).toBe(
      oneRun(['cli', 'Dev container', 'Dev environment']),
    );
  });

  it('keeps equal ranks in the order they arrive', () => {
    const readme = oneRun(['http', 'Monitoring stack', 'Dev container']);
    expect(place('Observability', HTTP)(readme)).toBe(
      oneRun(['http', 'Monitoring stack', 'Observability', 'Dev container']),
    );
    const other = oneRun(['http', 'Observability', 'Dev container']);
    expect(place('Monitoring stack', HTTP)(other)).toBe(
      oneRun(['http', 'Observability', 'Monitoring stack', 'Dev container']),
    );
    expect(place('Database', HTTP)(oneRun(['http', 'Persistence', 'Toolchain']))).toBe(
      oneRun(['http', 'Persistence', 'Database', 'Toolchain']),
    );
  });

  it('never moves a section already there, even one the user put out of order', () => {
    expect(place('Persistence', HTTP)(oneRun(['Toolchain', 'http']))).toBe(
      oneRun(['Persistence', 'Toolchain', 'http']),
    );
  });

  it("passes over a section keel does not write, a plugin's or the user's", () => {
    const deploying = oneRun(['http', 'Dev container', 'Deploying']);
    expect(place('Toolchain', HTTP)(deploying)).toBe(append(deploying, 'Toolchain'));
    expect(place('Persistence', HTTP)(oneRun(['http', 'Deploying', 'Toolchain']))).toBe(
      oneRun(['http', 'Deploying', 'Persistence', 'Toolchain']),
    );
  });

  it('is its own fixed point behind the marker guard', () => {
    const once = place('Persistence', HTTP)(oneRun(['http', 'Toolchain']));
    expect(place('Persistence', HTTP)(once)).toBe(once);
  });

  it('works on a CRLF README in its own line endings, and stays a fixed point there', () => {
    const crlf = (text: string): string => text.replace(/\n/g, '\r\n');
    const once = place('Persistence', HTTP)(crlf(oneRun(['http', 'Toolchain'])));
    expect(once).toBe(crlf(oneRun(['http', 'Persistence', 'Toolchain'])));
    expect(place('Persistence', HTTP)(once)).toBe(once);
    expect(placeReadmeSection(crlf(SEED), section('cli'), CLI)).toBe(crlf(append(SEED, 'cli')));
  });

  it('reads no heading inside a fenced block, which only a fence like its own closes', () => {
    const fences = [
      '```md\n### Toolchain\n```',
      '~~~\n### Toolchain\n~~~',
      '~~~\n```\n### Toolchain\n~~~',
      '````md\n```sh\nmise install\n```\n### Toolchain\n````',
      '   ```md\n### Toolchain\n   ```',
    ];
    for (const fence of fences) {
      const fenced = `${oneRun(['http'])}\n${fence}\n`;
      expect(place('Persistence', HTTP)(fenced), fence).toBe(append(fenced, 'Persistence'));
    }
    const toolchain = '\n### Toolchain\n\n```sh\n## a comment, not a heading\nmise install\n```\n';
    const commented = `${oneRun(['http']).trimEnd()}\n${toolchain}`;
    expect(place('Persistence', HTTP)(commented)).toBe(
      `${oneRun(['http', 'Persistence']).trimEnd()}\n${toolchain}`,
    );
  });

  it('reads no heading inside an HTML comment, as one a user hides a section in', () => {
    const hidden = `${oneRun(['http']).trimEnd()}\n\n<!--\n${section('Toolchain').trim()}\n-->\n`;
    expect(place('Persistence', HTTP)(hidden)).toBe(append(hidden, 'Persistence'));
    const license = '\n<!--\n## License\n\nTBD\n-->\n';
    expect(place('Persistence', HTTP)(`${oneRun(['http', 'Toolchain'])}${license}`)).toBe(
      `${oneRun(['http', 'Persistence', 'Toolchain'])}${license}`,
    );
    for (const seed of [
      `${SEED}\n<!-- a note -->\n`,
      `${SEED}\n\`\`\`html\n<!-- markup\n\`\`\`\n`,
    ]) {
      expect(place('Persistence', HTTP)(oneRun(['http', 'Toolchain'], seed)), seed).toBe(
        oneRun(['http', 'Persistence', 'Toolchain'], seed),
      );
    }
  });

  it("ranks only the headings after the README's last `## ` line, none of the user's above it", () => {
    const body = SEED.replace(/^# demo\n\n/, '');
    for (const mine of ['# mine\n\n', '# mine\n\n## Development\n\n']) {
      const adopted = `${mine}### Toolchain\n\nmine\n\n${body}`;
      expect(place('Persistence', HTTP)(oneRun(['http'], adopted)), mine).toBe(
        oneRun(['http', 'Persistence'], adopted),
      );
    }
    const noLevelTwo = oneRun(['http', 'Toolchain'], '# demo\n\nNothing else.\n');
    expect(place('Persistence', HTTP)(noLevelTwo)).toBe(append(noLevelTwo, 'Persistence'));
    const license = `${oneRun(['http', 'Toolchain'])}\n## License\n\nMIT\n`;
    expect(place('Persistence', HTTP)(license)).toBe(append(license, 'Persistence'));
  });

  it('appends to an empty file as before', () => {
    expect(placeReadmeSection('', section('cli'), CLI)).toBe(append('', 'cli'));
  });
});

describe('readmeSectionRank', () => {
  it('ranks the entrypoints, then what runs beside them, then persistence, then the toolchain', () => {
    const ranks = [
      'cli',
      'http',
      'Dev environment',
      'Observability',
      'Dev container',
      'Persistence',
      'Toolchain',
    ].map((heading) => readmeSectionRank(heading, HTTP));
    expect(ranks).toEqual([...ranks].sort((a = 0, b = 0) => a - b));
    expect(readmeSectionRank('rest', HTTP)).toBe(readmeSectionRank('http', HTTP));
    expect(readmeSectionRank('Monitoring stack', HTTP)).toBe(
      readmeSectionRank('Observability', HTTP),
    );
    expect(readmeSectionRank('Database', HTTP)).toBe(readmeSectionRank('Persistence', HTTP));
    expect(readmeSectionRank('Layout', HTTP)).toBeUndefined();
  });
});

describe("DR1: the dev container's rank, read from the presets", () => {
  it('holds every single-service preset to dev-env before dev-container exactly where its tags carry arch.server-http, and to no dev-env elsewhere', () => {
    const presets = shippedRegistry.stacks().filter((stack) => (stack.services ?? []).length === 0);
    const drifted = presets.flatMap((stack) => {
      const ids = stack.verticals.map((vertical) => vertical.id);
      const devEnv = ids.indexOf(devEnvVertical.id);
      const devContainer = ids.indexOf(devContainerVertical.id);
      const holds = stack.tags.includes('arch.server-http')
        ? devEnv !== -1 && devEnv < devContainer
        : devEnv === -1;
      return holds ? [] : [`${stack.id}: ${ids.join(', ')}`];
    });
    expect(presets.length).toBeGreaterThan(0);
    expect(drifted).toEqual([]);
  });

  it('ranks the dev container after the dev environment on those tags, and before it elsewhere', () => {
    const rank = (heading: string, tags: readonly Tag[]): number =>
      readmeSectionRank(heading, tags) ?? Number.NaN;
    expect(rank('Dev container', HTTP)).toBeGreaterThan(rank('Observability', HTTP));
    expect(rank('Dev container', CLI)).toBeLessThan(rank('Dev environment', CLI));
  });
});
