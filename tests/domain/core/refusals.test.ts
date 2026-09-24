/**
 * The words a refusal is written in, as a table: each row a `Refusal`
 * — the data a front end receives — and the one sentence
 * `refusalSentence` reads it as, in either phase. The gaps these are
 * written from are pinned where they are computed (`resolver.test.ts`,
 * `planner.test.ts`); these pin what a user reads: an entrypoint by
 * the label the finder offered it under, a build system by its label,
 * a capability by the vertical that adds it, the vertical by its
 * title, and never a tag, a `--with` or a `keel add`.
 */

import { describe, expect, it } from 'vitest';
import type { Vertical } from '../../../src/domain/contract/composition.js';
import type { ReadinessGap } from '../../../src/domain/contract/queries.js';
import { RefusalError, type Refusal } from '../../../src/domain/contract/refusal.js';
import {
  elsewhereRefusal,
  productRootPlacementRefusal,
  providedNote,
  refusalSentence,
  ruleRefusal,
  unbuiltInServiceNote,
  uncoveredRefusal,
  unavailableRefusal,
  WRONG_SCOPE_CODE,
  type RefusalNames,
} from '../../../src/domain/core/refusals.js';

const vertical = (
  id: string,
  title: string,
  promotes: readonly string[] = [],
  because?: string,
): Vertical => ({
  id,
  title,
  description: '',
  dimensions: [],
  adapters: [],
  promotes,
  ...(because === undefined ? {} : { placement: { scope: 'repository', because } }),
});

const REGISTERED: readonly Vertical[] = [
  vertical('observability', 'Observability'),
  vertical('containerization', 'Container image', ['deploy.container-image']),
  vertical(
    'distribution',
    'Distribution',
    ['dist.container-image', 'dist.release'],
    'its release workflows are read at the repository root only',
  ),
  vertical(
    'ci',
    'Continuous integration',
    ['ci.github-actions'],
    'its pipeline is read at the root',
  ),
  vertical('gateway', 'Service gateway'),
  vertical('iac', 'Infrastructure as code'),
];

/** Names over the fixture above — what a registry answers. */
const names: RefusalNames = {
  vertical: (id) => REGISTERED.find((candidate) => candidate.id === id) ?? null,
  verticals: () => REGISTERED,
};

const unavailable = (
  missing: Extract<Refusal, { kind: 'unavailable' }>['missing'],
  carriedBy: readonly string[] = [],
  id = 'observability',
): Refusal => ({ kind: 'unavailable', vertical: id, missing, carriedBy });

/** A tag of any namespace a sentence could leak. */
const ANY_TAG = /\b(?:lang|framework|runtime|pkg|layout|arch|peer|deploy|dist|ci)\.[a-z]/;

const TABLE: readonly {
  readonly why: string;
  readonly refusal: Refusal;
  readonly sentence: string;
}[] = [
  {
    why: 'a missing entrypoint, by its finder label',
    refusal: unavailable({ entrypoint: ['arch.server-http'] }, ['quarkus-cli-rest']),
    sentence:
      'Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint',
  },
  {
    why: 'every missing entrypoint, in the finder’s order',
    refusal: unavailable({ entrypoint: ['arch.server-http', 'arch.cli'] }),
    sentence:
      'Observability needs entrypoints this project does not have: CLI — a command-line entrypoint, HTTP server — a REST endpoint',
  },
  {
    why: 'a framework swap as no adapter, naming the nearest stack that carries it',
    refusal: unavailable({ identity: ['framework.quarkus'] }, ['spring-cli-rest']),
    sentence:
      "Observability has no adapter for this project's stack; the nearest stack that carries it: spring-cli-rest",
  },
  {
    why: 'every stack tied for nearest',
    refusal: unavailable({ identity: ['lang.go'] }, ['ts-http', 'ts-cli-http']),
    sentence:
      "Observability has no adapter for this project's stack; the nearest stacks that carry it: ts-http, ts-cli-http",
  },
  {
    why: 'an identity gap no stack closes as no adapter, and nothing more',
    refusal: unavailable({ identity: ['runtime.node'] }),
    sentence: "Observability has no adapter for this project's stack",
  },
  {
    why: 'a mixed gap as the identity half, since the entrypoint alone would not help',
    refusal: unavailable({ entrypoint: ['arch.server-http'], identity: ['runtime.node'] }, [
      'ts-http',
    ]),
    sentence:
      "Observability has no adapter for this project's stack; the nearest stack that carries it: ts-http",
  },
  {
    why: 'an `arch.` tag that is not an entrypoint as identity',
    refusal: unavailable({ identity: ['arch.hexagonal', 'lang.go'] }),
    sentence: "Observability has no adapter for this project's stack",
  },
  {
    why: 'a layout as identity',
    refusal: unavailable({ identity: ['layout.modulith'] }),
    sentence: "Observability has no adapter for this project's stack",
  },
  {
    why: 'adapters ruled out by what the project has as no adapter',
    refusal: unavailable({}),
    sentence: "Observability has no adapter for this project's stack",
  },
  {
    why: 'a build system alone by its label',
    refusal: unavailable({ identity: ['pkg.maven'] }, ['spring-rest']),
    sentence:
      "Observability has no adapter for this project's build system; it needs Maven — convention-first declarative build (POM); the nearest stack that carries it: spring-rest",
  },
  {
    why: 'a capability by the vertical that adds it',
    refusal: unavailable({ identity: ['deploy.container-image'] }),
    sentence: 'Observability needs what Container image adds, which this project does not have yet',
  },
  {
    why: 'a pattern by every vertical that adds a tag it matches',
    refusal: unavailable({ identity: ['ci.*', 'dist.container-image'] }),
    sentence:
      'Observability needs what Continuous integration and Distribution add, which this project does not have yet',
  },
  {
    why: 'an entrypoint and a capability, both',
    refusal: unavailable({
      entrypoint: ['arch.server-http'],
      identity: ['deploy.container-image'],
    }),
    sentence:
      'Observability needs an entrypoint this project does not have: HTTP server — a REST endpoint; and what Container image adds, which this project does not have yet',
  },
  {
    why: 'a capability nothing adds as no adapter',
    refusal: unavailable({ identity: ['acme.widget'] }),
    sentence: "Observability has no adapter for this project's stack",
  },
  {
    why: 'a linked project alone as linking one',
    refusal: unavailable({ peer: ['peer.ui.spa'] }, [], 'gateway'),
    sentence:
      'Service gateway wires linked projects, and no linked project serves it here — link one that does first',
  },
  {
    why: 'an entrypoint and a linked project as the entrypoint, which linking would not add',
    refusal: unavailable(
      { entrypoint: ['arch.server-http'], peer: ['peer.ui.spa'] },
      [],
      'gateway',
    ),
    sentence:
      'Service gateway needs an entrypoint this project does not have: HTTP server — a REST endpoint',
  },
  {
    why: 'a rule of the vertical’s own, in its own words, over any gap',
    refusal: {
      kind: 'unavailable',
      vertical: 'observability',
      missing: { entrypoint: ['arch.server-http'] },
      carriedBy: [],
      because: "a probe needs a server to answer it (rule 'acme/probe-needs-server')",
      rules: ['acme/probe-needs-server'],
    },
    sentence:
      "Observability cannot be installed here: a probe needs a server to answer it (rule 'acme/probe-needs-server')",
  },
  {
    why: 'an unregistered vertical by its id spelled out',
    refusal: unavailable({}, [], 'acme-widget'),
    sentence: "Acme widget has no adapter for this project's stack",
  },
  {
    why: 'a tie as each option, and the choice as the user’s',
    refusal: {
      kind: 'needs',
      verticals: ['iac'],
      prerequisites: [
        ['containerization', 'distribution'],
        ['acme-image', 'distribution'],
      ],
    },
    sentence:
      'Infrastructure as code needs one of these installed first, and choosing is yours: (containerization, distribution) or (acme-image, distribution) — name the one you want as well',
  },
  {
    why: 'a tie over two requested verticals in the plural',
    refusal: {
      kind: 'needs',
      verticals: ['distribution', 'iac'],
      prerequisites: [['containerization'], ['acme-image']],
    },
    sentence:
      'Distribution and Infrastructure as code need one of these installed first, and choosing is yours: (containerization) or (acme-image) — name the one you want as well',
  },
  {
    why: 'a product root as the services that can take it',
    refusal: {
      kind: 'elsewhere',
      vertical: 'observability',
      services: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'ready' },
        { path: 'worker', stack: 'go-http', readiness: 'needs' },
        { path: 'frontend', stack: 'web-components', readiness: 'unavailable' },
      ],
    },
    sentence:
      'Observability belongs to a service, not to the product root — it goes in backend/ or worker/',
  },
  {
    why: 'a product root whose services have it already',
    refusal: {
      kind: 'elsewhere',
      vertical: 'ci',
      services: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'included' },
        { path: 'frontend', stack: 'web-components', readiness: 'included' },
      ],
    },
    sentence:
      'Continuous integration belongs to a service, not to the product root — backend/ and frontend/ have it already',
  },
  {
    why: 'a product root with one service that has it',
    refusal: {
      kind: 'elsewhere',
      vertical: 'observability',
      services: [
        { path: 'backend', stack: 'quarkus-rest', readiness: 'included' },
        { path: 'frontend', stack: 'web-components', readiness: 'unavailable' },
      ],
    },
    sentence:
      'Observability belongs to a service, not to the product root — backend/ has it already',
  },
  {
    why: 'a product root none of whose services can take it',
    refusal: {
      kind: 'elsewhere',
      vertical: 'observability',
      services: [{ path: 'frontend', stack: 'web-components', readiness: 'unavailable' }],
    },
    sentence:
      'Observability belongs to a service, not to the product root — none of its services can carry it',
  },
  {
    why: 'a monorepo service asked for what only a repository root reads, in its own words',
    refusal: {
      kind: 'unavailable',
      vertical: 'ci',
      missing: {},
      carriedBy: [],
      repositoryOnly: ['ci'],
    },
    sentence:
      'Continuous integration cannot go in a monorepo service: its pipeline is read at the root',
  },
  {
    why: 'a monorepo service asked for what needs one, in that one’s words',
    refusal: {
      kind: 'unavailable',
      vertical: 'iac',
      missing: {},
      carriedBy: [],
      repositoryOnly: ['distribution'],
    },
    sentence:
      'Infrastructure as code needs Distribution, which cannot go in a monorepo service: its release workflows are read at the repository root only',
  },
  {
    why: 'verticals no order installs together',
    refusal: { kind: 'incompatible', verticals: ['distribution', 'containerization'] },
    sentence:
      'Distribution and Container image cannot be installed together here — each installs on its own, but no order installs them all; drop one',
  },
  {
    why: 'a file in the way, whatever put it there',
    refusal: { kind: 'path-conflict', path: 'Dockerfile', adapterId: 'containerization/go-image' },
    sentence:
      "'Dockerfile' already exists, and keel does not overwrite a file this run did not write",
  },
  {
    why: 'a file lacking the block keel patches inside',
    refusal: {
      kind: 'path-conflict',
      path: 'pom.xml',
      adapterId: 'code-style/jvm-format',
      anchor: '<build> element',
    },
    sentence:
      "'pom.xml' has no <build> element — keel adds its lines inside it and does not rewrite the file; add one, then re-run",
  },
  {
    why: 'a patch target gone',
    refusal: { kind: 'path-missing', path: 'README.md', adapterId: 'toolchain/mise' },
    sentence: "'README.md' is missing — keel patches it and does not recreate it; restore it",
  },
];

describe('refusalSentence', () => {
  it.each(TABLE)('says $why', ({ refusal, sentence }) => {
    expect(refusalSentence(refusal, names)).toBe(sentence);
  });

  it('names no tag, and no command of either phase, in any row', () => {
    for (const { refusal } of TABLE) {
      const sentence = refusalSentence(refusal, names);
      expect(sentence).not.toMatch(ANY_TAG);
      expect(sentence).not.toMatch(/--with|keel add\b|keel new\b/);
    }
  });
});

describe('the refusals built from a gap', () => {
  const gap: ReadinessGap = {
    entrypoint: ['arch.server-http'],
    peer: [],
    identity: [],
    rules: [],
    nearestStacks: ['quarkus-cli-rest'],
  };
  const observability = REGISTERED[0] as Vertical;

  it('carries the planner’s gap as the refusal, under the coverage code', () => {
    const refusal = unavailableRefusal(names, observability, gap);
    expect(refusal).toBeInstanceOf(RefusalError);
    expect(refusal.code).toBe('keel.uncoverable-vertical');
    expect(refusal.refusal).toEqual({
      kind: 'unavailable',
      vertical: 'observability',
      missing: { entrypoint: ['arch.server-http'] },
      carriedBy: ['quarkus-cli-rest'],
    });
    expect(refusal.message).toBe(refusalSentence(refusal.refusal, names));
  });

  it('refuses a vertical one of its own rules forbids as that rule', () => {
    const ruled: Vertical = {
      ...observability,
      conflicts: [
        {
          id: 'observability/not-on-native',
          when: ['runtime.native'],
          reason: 'a native binary has no agent to attach',
        },
      ],
    };
    const refusal = unavailableRefusal(names, ruled, {
      ...gap,
      rules: ['observability/not-on-native'],
    });
    expect(refusal.code).toBe('keel.incompatible');
    expect(refusal.message).toBe(
      "Observability cannot be installed here: a native binary has no agent to attach (rule 'observability/not-on-native')",
    );
    expect(ruleRefusal(names, ruled, ['runtime.native'])?.message).toBe(refusal.message);
    expect(ruleRefusal(names, ruled, ['runtime.jvm'])).toBeNull();
  });

  it('sorts the resolver’s enablers into the same three kinds', () => {
    const refusal = uncoveredRefusal(
      observability,
      ['arch.server-http', 'framework.quarkus', 'peer.ui.spa'],
      names,
    );
    expect(refusal.code).toBe('keel.uncoverable-vertical');
    expect(refusal.refusal).toEqual({
      kind: 'unavailable',
      vertical: 'observability',
      missing: {
        entrypoint: ['arch.server-http'],
        peer: ['peer.ui.spa'],
        identity: ['framework.quarkus'],
      },
      carriedBy: [],
    });
  });

  it('names the vertical it was handed even when the names do not know it', () => {
    const plugin: Vertical = {
      id: 'acme-probe',
      title: 'Probe',
      description: '',
      dimensions: [],
      adapters: [],
    };
    expect(uncoveredRefusal(plugin, []).message).toBe(
      "Probe has no adapter for this project's stack",
    );
  });
});

describe('the refusals and notes of a scope', () => {
  const [, containerization, distribution, ci, , iac] = REGISTERED as readonly Vertical[];

  it('refuses a vertical stopped only by where it was asked as the wrong scope', () => {
    const refusal = unavailableRefusal(names, iac as Vertical, {
      entrypoint: [],
      peer: [],
      identity: [],
      rules: [],
      nearestStacks: [],
      repositoryOnly: ['distribution'],
    });
    expect(refusal.code).toBe(WRONG_SCOPE_CODE);
    expect(refusal.refusal).toEqual({
      kind: 'unavailable',
      vertical: 'iac',
      missing: {},
      carriedBy: [],
      repositoryOnly: ['distribution'],
    });
    expect(refusal.message).toBe(refusalSentence(refusal.refusal, names));
  });

  it('sends a product root’s request to its services under the same code', () => {
    const refusal = elsewhereRefusal(names, containerization as Vertical, [
      { path: 'backend', stack: 'quarkus-rest', readiness: 'included' },
    ]);
    expect(refusal.code).toBe(WRONG_SCOPE_CODE);
  });

  it('sends a repository-root vertical nowhere from a product root that cannot carry it', () => {
    const refusal = productRootPlacementRefusal(names, ci as Vertical);
    expect(refusal.code).toBe('keel.uncoverable-vertical');
    expect(refusal.message).toBe(
      "Continuous integration cannot be installed here: nothing keel has installs it at a product root yet, and its place is the repository's root, so no service of this product can take it instead",
    );
    expect(refusal.message).not.toMatch(ANY_TAG);
  });

  it('says where a vertical a monorepo service has from its product comes from', () => {
    expect(providedNote(distribution as Vertical, 'repository')).toBe(
      'Distribution is already there: the product root has it, for the one repository its services share',
    );
    expect(providedNote(containerization as Vertical, 'product')).toBe(
      'Container image is already there: the product root builds it for this service',
    );
    expect(unbuiltInServiceNote('backend', containerization as Vertical)).toBe(
      "backend/ has no Container image from the product root, which builds one only for the stacks it knows — 'keel add containerization' there adds its own",
    );
  });
});
