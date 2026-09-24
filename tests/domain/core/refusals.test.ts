/**
 * The words a coverage refusal is written in. The gap it is written
 * from is pinned in `resolver.test.ts`; these pin what a user reads:
 * an entrypoint by the label the finder offered it under, the
 * vertical by its title, and never a tag no command can add.
 */

import { describe, expect, it } from 'vitest';
import type { Vertical } from '../../../src/domain/contract/composition.js';
import { coverageSentence, productRootSentence } from '../../../src/domain/core/refusals.js';

const observability: Vertical = {
  id: 'observability',
  title: 'Observability',
  description: '',
  dimensions: [],
  adapters: [],
};

describe('coverageSentence', () => {
  it.each([
    {
      why: 'a missing entrypoint, by its finder label',
      enablers: ['arch.server-http'],
      sentence:
        'Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint',
    },
    {
      why: 'every missing entrypoint, in the finder’s order',
      enablers: ['arch.server-http', 'arch.cli'],
      sentence:
        'Observability needs entrypoints this project does not have: CLI — a command-line entrypoint, HTTP server — a REST endpoint',
    },
    {
      why: 'a capability another install adds, as missing yet',
      enablers: ['dist.container-image'],
      sentence:
        'Observability needs a capability this project does not have yet: dist.container-image',
    },
    {
      why: 'both halves, when both are missing',
      enablers: ['arch.server-http', 'dist.container-image'],
      sentence:
        'Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint; and a capability this project does not have yet: dist.container-image',
    },
    {
      why: 'a framework swap as no adapter at all',
      enablers: ['framework.quarkus'],
      sentence: "Observability has no adapter for this project's stack",
    },
    {
      why: 'a mixed gap as the identity half, since the entrypoint alone would not help',
      enablers: ['arch.server-http', 'runtime.node'],
      sentence: "Observability has no adapter for this project's stack",
    },
    {
      why: 'an `arch.` tag that is not an entrypoint as identity',
      enablers: ['arch.cli', 'arch.hexagonal', 'lang.go', 'pkg.gradle'],
      sentence: "Observability has no adapter for this project's stack",
    },
    {
      why: 'a layout as identity',
      enablers: ['layout.modulith'],
      sentence: "Observability has no adapter for this project's stack",
    },
    {
      why: 'a dimension nothing covers as no adapter',
      enablers: [],
      sentence: "Observability has no adapter for this project's stack",
    },
  ])('says $why', ({ enablers, sentence }) => {
    expect(coverageSentence(observability, enablers)).toBe(sentence);
  });

  it('names no identity tag, whatever the gap', () => {
    const sentence = coverageSentence(observability, [
      'arch.server-http',
      'framework.spring',
      'lang.kotlin',
      'pkg.maven',
      'runtime.jvm',
    ]);
    expect(sentence).not.toMatch(/\b(arch|lang|framework|runtime|pkg|layout)\.[a-z]/);
  });

  it('falls back to the id spelled out for a vertical with no title', () => {
    const plugin: Vertical = { id: 'acme-widget', description: '', dimensions: [], adapters: [] };
    expect(coverageSentence(plugin, [])).toBe(
      "Acme widget has no adapter for this project's stack",
    );
  });
});

describe('productRootSentence', () => {
  it.each([
    { paths: ['backend'], where: 'backend/' },
    { paths: ['backend', 'frontend'], where: 'backend/ or frontend/' },
    { paths: ['api', 'worker', 'web'], where: 'api/, worker/ or web/' },
  ])('sends the user into $where', ({ paths, where }) => {
    expect(
      productRootSentence(
        observability,
        paths.map((path) => ({ path })),
      ),
    ).toBe(
      `Observability belongs to a service, and this is a product root — run 'keel add observability' inside ${where}`,
    );
  });
});
