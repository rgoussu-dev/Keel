/**
 * Tests for the `layout.modulith` module layout on the Go stacks.
 *
 * Go's layout risk is **name derivation**, not directory depth: there
 * are no relative imports, so every import line is the module path
 * concatenated with the layout's depth and the context's name, and a
 * template that concatenates one itself is a bug waiting for the
 * second context. So what these tests hold is mostly *paths and the
 * import lines derived from them* — that `goLayout` puts each package
 * where the compiler needs it, that the facade exports factories and
 * no aliases, and that an import block comes out in the order gofmt
 * wants (which of two paths sorts first flips between the layouts).
 *
 * What they deliberately do not attempt is the walls themselves. That
 * `cmd/` cannot import a context's `internal/`, and that the facade's
 * silence makes its port unnameable, are claims only a compiler can
 * settle — `tests/e2e/walking-skeleton-go.test.ts` settles them by
 * requiring two probe files to fail to build.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { spawnProcessRunner } from '../../../../src/infrastructure/process/spawn-process-runner.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { observabilityVertical } from '../../../../src/domain/core/verticals/observability.js';
import { persistenceVertical } from '../../../../src/domain/core/verticals/persistence.js';
import { walkingSkeletonVertical } from '../../../../src/domain/core/verticals/walking-skeleton.js';
import { resolveVertical } from '../../../../src/domain/core/resolver.js';
import { goLayout, goPeerPackages } from '../../../../src/domain/core/adapters/go-module-layout.js';
import {
  BASIC_LAYOUT_TAG,
  MODULITH_LAYOUT_TAG,
  PEER_CONTEXT_TAG,
} from '../../../../src/domain/core/adapters/module-layout.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import type { Vertical } from '../../../../src/domain/contract/composition.js';

const MODULE = 'example.com/skel';

const tags = (...extra: string[]): string[] => [
  'lang.go',
  'pkg.go-modules',
  'arch.hexagonal',
  ...extra,
];

const ANSWERS = {
  'walking-skeleton/go-bootstrap': { modulePath: MODULE, projectName: 'skel' },
};

const cwds: string[] = [];

const install = async (verticals: readonly Vertical[], projectTags: string[]): Promise<FsTree> => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-go-modulith-'));
  cwds.push(cwd);
  const tree = new FsTree(cwd);
  for (const vertical of verticals) {
    await installVertical({
      vertical,
      manifest: {
        ...emptyManifestV2('2026-08-14T00:00:00Z', '0.5.0-alpha'),
        tags: projectTags,
        answers: ANSWERS,
      },
      tree,
      mode: 'non-interactive',
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      cwd,
      templates: ejsTemplateSource,
      processes: spawnProcessRunner,
      now: () => '2026-08-14T12:00:00Z',
    });
  }
  return tree;
};

const read = (tree: FsTree, file: string): string => tree.read(file)?.toString() ?? '';

beforeEach(() => {
  cwds.length = 0;
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

describe('goLayout', () => {
  it('resolves to the flat tree when no layout tag is recorded', () => {
    // Every Go project scaffolded before the dial existed is in this
    // case, which is what keeps `keel add` working on them.
    const layout = goLayout([], MODULE);
    expect(layout.layout).toBe('basic');
    expect(layout.facade).toBe('internal/domain');
    expect(layout.app('resthttp')).toBe('internal/app/resthttp');
    expect(layout.infra('postgres')).toBe('internal/infra/postgres');
    expect(layout.importPath(layout.domain)).toBe(`${MODULE}/internal/domain`);
  });

  it('puts the context core behind internal/ and its adapters beside it', () => {
    const layout = goLayout([MODULITH_LAYOUT_TAG], MODULE);
    expect(layout.domain).toBe('internal/modules/greeting/internal/domain');
    // Beside the wall, not behind it — anything under the context's
    // internal/ is unreachable from cmd/, so the assembly could not
    // construct it.
    expect(layout.app('resthttp')).toBe('internal/modules/greeting/userside/resthttp');
    expect(layout.infra('postgres')).toBe('internal/modules/greeting/infra/postgres');
    expect(layout.app('resthttp').includes('/internal/')).toBe(false);
    expect(layout.infra('postgres').includes('/internal/')).toBe(false);
  });

  it('moves what no context owns out of the contexts', () => {
    const layout = goLayout([MODULITH_LAYOUT_TAG], MODULE);
    expect(layout.clockPort).toBe('internal/platform/clock');
    expect(layout.clockPkg).toBe('clock');
    expect(layout.platform('clockfake')).toBe('internal/platform/clockfake');
    expect(layout.crossCutting('observability')).toBe('internal/platform/observability');
  });

  it('keeps the assembly point where it was', () => {
    expect(goLayout([MODULITH_LAYOUT_TAG], MODULE).main('http')).toBe('cmd/http/main.go');
    expect(goLayout([BASIC_LAYOUT_TAG], MODULE).main('http')).toBe('cmd/http/main.go');
  });

  // The seam sits beside the wall, never behind it: a peer that
  // cannot import it is a peer that cannot use this context at all.
  it('puts the peer seam outside the context internal/, and only under the modulith', () => {
    const modulith = goLayout([MODULITH_LAYOUT_TAG], MODULE);
    expect(modulith.service).toBe('internal/modules/greeting/userside/service');
    expect(modulith.servicePkg).toBe('service');
    expect(modulith.service?.includes('/internal/')).toBe(false);

    const flat = goLayout([BASIC_LAYOUT_TAG], MODULE);
    expect(flat.service).toBeNull();
    expect(flat.servicePkg).toBeNull();
  });
});

describe('the Go modulith tree', () => {
  it('carves the skeleton into a context, a platform and an assembly', async () => {
    const tree = await install([walkingSkeletonVertical], tags('arch.cli', MODULITH_LAYOUT_TAG));
    for (const p of [
      'internal/modules/greeting/greeting.go',
      'internal/modules/greeting/internal/domain/greet.go',
      'internal/modules/greeting/internal/domain/greet_test.go',
      'internal/modules/greeting/internal/domain/internal/greet/greet.go',
      'internal/modules/greeting/userside/cli/app.go',
      'internal/modules/greeting/userside/service/service.go',
      'internal/modules/greeting/userside/service/service_test.go',
      'internal/platform/clock/clock.go',
      'internal/platform/clockfake/clock.go',
      'cmd/cli/main.go',
    ]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    // None of the flat homes survive.
    expect(tree.read('internal/domain/greet.go')).toBeNull();
    expect(tree.read('internal/app/cli/app.go')).toBeNull();
  });

  // The facade is the whole wall. A single `type Greeter = …` here
  // would let any consumer name the port, and naming it is all it
  // takes to implement it.
  it('emits a facade that exports factories and no aliases', async () => {
    const tree = await install(
      [walkingSkeletonVertical],
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    const facade = read(tree, 'internal/modules/greeting/greeting.go');
    expect(facade).toContain('func NewGreeter() domain.Greeter');
    expect(facade).not.toMatch(/^type \w+ = /m);
    expect(facade).not.toMatch(/^var \w+ = domain\./m);
  });

  /**
   * The seam is the peer-facing aperture, so what it must not do is
   * hand a peer a greeting type. Its exported signatures carry its
   * own `Greeting` and `Unavailable`; `domain.` appears only on
   * `New`'s parameter, which is why only the assembly can call it.
   */
  it('emits a seam whose exported surface is its own vocabulary', async () => {
    const tree = await install(
      [walkingSkeletonVertical],
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    const seam = read(tree, 'internal/modules/greeting/userside/service/service.go');

    expect(seam).toContain('package service');
    expect(seam).toContain('GreetingFor(name string) (Greeting, error)');
    expect(seam).toContain('func New(greeter domain.Greeter) GreetingService');
    // Every other exported declaration is this package's own type.
    const exported = [...seam.matchAll(/^type ([A-Z]\w*) (?:struct|interface)/gm)].map((m) => m[1]);
    expect(exported.sort()).toEqual(['Greeting', 'GreetingService', 'Unavailable']);
    expect(seam).not.toMatch(/^type \w+ = /m);
  });

  it('derives every import from the module path and the layout', async () => {
    const tree = await install(
      [walkingSkeletonVertical],
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    const main = read(tree, 'cmd/http/main.go');
    expect(main).toContain(`"${MODULE}/internal/modules/greeting"`);
    expect(main).toContain(`"${MODULE}/internal/modules/greeting/userside/resthttp"`);
    // The assembly reaches the context through the facade's package
    // name, never through `domain`.
    expect(main).toContain('greeter := greeting.NewGreeter()');
    expect(main).not.toContain(`"${MODULE}/internal/modules/greeting/internal/domain"`);
  });

  // gofmt sorts an import block, and under the modulith the facade's
  // path is a prefix of the adapter's — so it sorts first, the
  // reverse of the flat layout. A template cannot know that.
  it('orders the assembly import block the way gofmt would', async () => {
    const modulith = read(
      await install([walkingSkeletonVertical], tags('arch.server-http', MODULITH_LAYOUT_TAG)),
      'cmd/http/main.go',
    );
    const project = modulith
      .split('\n')
      .filter((l) => l.includes(`"${MODULE}`))
      .map((l) => l.trim());
    expect(project).toEqual([...project].sort());

    const flat = read(
      await install([walkingSkeletonVertical], tags('arch.server-http', BASIC_LAYOUT_TAG)),
      'cmd/http/main.go',
    );
    const flatProject = flat
      .split('\n')
      .filter((l) => l.includes(`"${MODULE}`))
      .map((l) => l.trim());
    expect(flatProject).toEqual([...flatProject].sort());
  });
});

describe('the Go verticals follow the layout', () => {
  // Regression: observability anchored its main.go patch on the flat
  // import path, so under the modulith it matched nothing, the drift
  // guard returned the file unchanged, and the package it had just
  // emitted was never reachable. `go build` stayed green — unwired
  // code compiles — which is why this is asserted on the wiring and
  // not on the files.
  it('wires observability into the modulith assembly, not just beside it', async () => {
    const tree = await install(
      [walkingSkeletonVertical, observabilityVertical],
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    expect(tree.read('internal/platform/observability/middleware.go')).not.toBeNull();
    const main = read(tree, 'cmd/http/main.go');
    expect(main).toContain(`"${MODULE}/internal/platform/observability"`);
    expect(main).toContain('observability.SetupLogging()');
    expect(main).toContain('health.Register(mux)');
    expect(main).toContain('observability.RequestContext(resthttp.NewHandler(greeter))');
  });

  it('covers persistence under both layouts', () => {
    // The slice used to exclude the modulith: its five packages all
    // move, and emitting them at flat paths would have compiled and
    // silently not wired. Now that every destination is a `goLayout`
    // call, both layouts resolve.
    for (const layout of [BASIC_LAYOUT_TAG, MODULITH_LAYOUT_TAG]) {
      expect(() =>
        resolveVertical(persistenceVertical, tags('arch.server-http', layout)),
      ).not.toThrow();
    }
  });

  it('puts every package of the persistence slice at its layout home', async () => {
    const tree = await install(
      [walkingSkeletonVertical, persistenceVertical],
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    for (const p of [
      // The ports are the context's contract face, behind its wall.
      'internal/modules/greeting/internal/domain/greetinglog.go',
      'internal/modules/greeting/internal/domain/unitofwork.go',
      'internal/modules/greeting/internal/domain/internal/greetinglog/greetinglog.go',
      // Adapters sit beside the wall so the assembly can construct them.
      'internal/modules/greeting/infra/postgres/postgres.go',
      'internal/modules/greeting/infra/greetinglogfake/greetinglog.go',
      'internal/modules/greeting/infra/uowfake/uow.go',
      'internal/modules/greeting/userside/resthttp/greetings.go',
      // A clock belongs to no context.
      'internal/platform/clocksys/clock.go',
    ]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
    // None of the flat homes survive.
    expect(tree.read('internal/domain/greetinglog.go')).toBeNull();
    expect(tree.read('internal/infra/postgres/postgres.go')).toBeNull();
  });

  // The defect this whole shape exists to prevent: emit a correct
  // package, leave the assembly untouched, and let `go build` stay
  // green because unwired code compiles. Asserted on the wiring.
  it('wires the persistence slice into the modulith assembly', async () => {
    const tree = await install(
      [walkingSkeletonVertical, persistenceVertical],
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    const main = read(tree, 'cmd/http/main.go');
    expect(main).toContain(`"${MODULE}/internal/modules/greeting/infra/postgres"`);
    expect(main).toContain(`"${MODULE}/internal/platform/clocksys"`);
    expect(main).toContain('pool, err := postgres.NewPool(context.Background())');
    expect(main).toContain('greetings := greeting.NewGreetingLogUseCases(');
    expect(main).toContain('resthttp.WithGreetings(resthttp.NewHandler(greeter), greetings)');
    // And it reaches the slice through the facade, never through the
    // context's domain — which it is not allowed to import at all.
    expect(main).not.toContain(`"${MODULE}/internal/modules/greeting/internal/domain"`);
  });

  // The facade is the aperture for the whole context, so a vertical
  // that adds a use case has to widen it rather than let `cmd/` reach
  // past it. Same rule as NewGreeter: factories, no aliases.
  it('extends the facade with the slice factory and still re-exports nothing', async () => {
    const tree = await install(
      [walkingSkeletonVertical, persistenceVertical],
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    const facade = read(tree, 'internal/modules/greeting/greetinglog.go');
    expect(facade).toContain('func NewGreetingLogUseCases(');
    expect(facade).toContain('domain.GreetingLogUseCases');
    expect(facade).not.toMatch(/^type \w+ = /m);
    expect(facade).not.toMatch(/^var \w+ = domain\./m);
    // Under `basic` the facade *is* the domain package, so the slice
    // adds no second file there.
    const flat = await install(
      [walkingSkeletonVertical, persistenceVertical],
      tags('arch.server-http', BASIC_LAYOUT_TAG),
    );
    expect(flat.read('internal/domain/greetinglog.go')).not.toBeNull();
  });

  // Absolute imports hide depth; a test that reads a file out of the
  // repo does not. This is the `upToRoot` bug's Go shape.
  it('walks back to the repo root from wherever the pgx test landed', async () => {
    const tree = await install(
      [walkingSkeletonVertical, persistenceVertical],
      tags('arch.server-http', MODULITH_LAYOUT_TAG),
    );
    expect(read(tree, 'internal/modules/greeting/infra/postgres/postgres_test.go')).toContain(
      'filepath.Glob("../../../../../migrations/sql/*.sql")',
    );
    const flat = await install(
      [walkingSkeletonVertical, persistenceVertical],
      tags('arch.server-http', BASIC_LAYOUT_TAG),
    );
    expect(read(flat, 'internal/infra/postgres/postgres_test.go')).toContain(
      'filepath.Glob("../../../migrations/sql/*.sql")',
    );
  });

  // gofmt sorts an import group, and under the modulith a context's
  // infra/ sorts before its internal/domain — the reverse of the flat
  // tree. Every file the slice emits with more than one project
  // import is exposed to that flip.
  it('orders every emitted import group the way gofmt would', async () => {
    for (const layout of [BASIC_LAYOUT_TAG, MODULITH_LAYOUT_TAG]) {
      const tree = await install(
        [walkingSkeletonVertical, persistenceVertical],
        tags('arch.server-http', layout),
      );
      const go = tree
        .changes()
        .map((c) => c.path)
        .filter((p) => p.endsWith('.go'));
      expect(go.length).toBeGreaterThan(10);
      for (const file of go) {
        const project = read(tree, file)
          .split('\n')
          .filter((l) => l.startsWith(`\t"${MODULE}/`))
          .map((l) => l.trim());
        expect(project, `${file} under ${layout}`).toEqual([...project].sort());
      }
    }
  });
});

/**
 * The peer context — `--with-peer-context`.
 *
 * What is worth asserting from emitted text is the *edge*: that the
 * gateway's import block names greeting's seam and nothing else of
 * greeting's, and that the wiring lands in the assembly's own
 * package. That the forbidden import fails to build, and that the
 * cross-context call really runs, are claims only a compiler can
 * settle — `tests/e2e/modulith-go-peer-context.test.ts` settles them.
 */
describe('the Go peer context', () => {
  const peerTags = (arch: string): string[] => tags(arch, MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG);

  it('files the peer beside the skeleton, in Go-legal package names', () => {
    const peer = goPeerPackages();
    expect(peer.facade).toBe('internal/modules/guestbook');
    expect(peer.domain).toBe('internal/modules/guestbook/internal/domain');
    // Beside the wall, not behind it: the assembly must be able to
    // construct both, and neither may sit under the context's
    // internal/.
    expect(peer.gateway).toBe('internal/modules/guestbook/infra/greetinggateway');
    expect(peer.userSide).toBe('internal/modules/guestbook/userside/signing');
    expect(peer.gateway.includes('/internal/')).toBe(false);
    expect(peer.userSide.includes('/internal/')).toBe(false);
    // A Go package name carries no dash, so the directory cannot
    // either — `greeting-gateway` is the Rust spelling and would
    // leave the package clause disagreeing with its own path.
    expect(peer.gatewayPkg).toBe('greetinggateway');
    expect(peer.gatewayPkg).not.toContain('-');
  });

  it('emits nothing without the tag', async () => {
    const tree = await install([walkingSkeletonVertical], tags('arch.cli', MODULITH_LAYOUT_TAG));
    expect(tree.read('internal/modules/guestbook/guestbook.go')).toBeNull();
    expect(tree.read('cmd/cli/guestbook.go')).toBeNull();
  });

  it('emits the context, its gateway and its driving adapter', async () => {
    const tree = await install([walkingSkeletonVertical], peerTags('arch.cli'));
    for (const p of [
      'internal/modules/guestbook/guestbook.go',
      'internal/modules/guestbook/internal/domain/sign.go',
      'internal/modules/guestbook/internal/domain/sign_test.go',
      'internal/modules/guestbook/internal/domain/internal/sign/sign.go',
      'internal/modules/guestbook/userside/signing/signing.go',
      'internal/modules/guestbook/userside/signing/signing_test.go',
      'internal/modules/guestbook/infra/greetinggateway/gateway.go',
      'internal/modules/guestbook/infra/greetinggateway/gateway_test.go',
    ]) {
      expect(tree.read(p), `missing ${p}`).not.toBeNull();
    }
  });

  /**
   * The edge that defines the seam. Read the import *lines* rather
   * than substring the file: the gateway's doc comment explains what
   * it must not import, so a substring check matches the prose that
   * documents the rule and fails a file that obeys it.
   */
  it('gives the gateway an edge to the seam and to no other greeting package', async () => {
    const tree = await install([walkingSkeletonVertical], peerTags('arch.server-http'));
    const gateway = read(tree, 'internal/modules/guestbook/infra/greetinggateway/gateway.go');
    const imports = gateway
      .split('\n')
      .filter((l) => l.includes(`"${MODULE}/`))
      .map((l) => l.trim());

    expect(imports).toEqual([
      `greetingservice "${MODULE}/internal/modules/greeting/userside/service"`,
      `"${MODULE}/internal/modules/guestbook/internal/domain"`,
    ]);
    // Which is also gofmt's order, and the check has to sort by the
    // quoted *path* to see it: gofmt orders by path and never by the
    // name a file calls it, so sorting the rendered lines would rank
    // the aliased one last and disagree with the formatter.
    const paths = imports.map((line) => /"([^"]+)"/.exec(line)?.[1] ?? '');
    expect(paths).toEqual([...paths].sort());
  });

  /**
   * Go's version of "the wiring is declared in the assembly". Rust
   * patches `mod guestbook;` into the assembly root and the JVM tells
   * its container to scan; a Go file in a `cmd/` directory joins that
   * package by existing. So there is no declaration to check — what
   * there is to check is that the file landed in the assembly and
   * claims its package.
   */
  it('lands the wiring inside each assembly package', async () => {
    const both = await install(
      [walkingSkeletonVertical],
      tags('arch.cli', 'arch.server-http', MODULITH_LAYOUT_TAG, PEER_CONTEXT_TAG),
    );
    for (const typology of ['cli', 'http']) {
      const wiring = read(both, `cmd/${typology}/guestbook.go`);
      expect(wiring, `cmd/${typology}/guestbook.go`).toContain('package main');
      expect(wiring).toContain('func wireGuestbook() signing.Signer');
      expect(read(both, `cmd/${typology}/guestbook_test.go`)).toContain('wireGuestbook()');
    }
  });

  /**
   * The assembly may name both contexts — it is the one place that
   * legitimately knows the whole graph — but the wiring is written
   * against the seam, so that copying it into a gateway does not
   * carry a domain edge along with it.
   */
  it('wires through the seam rather than through either domain', async () => {
    const tree = await install([walkingSkeletonVertical], peerTags('arch.cli'));
    const wiring = read(tree, 'cmd/cli/guestbook.go');

    expect(wiring).toContain(
      `greetingservice "${MODULE}/internal/modules/greeting/userside/service"`,
    );
    expect(wiring).not.toContain(`${MODULE}/internal/modules/greeting/internal/domain`);
    expect(wiring).not.toContain(`${MODULE}/internal/modules/guestbook/internal/domain`);
  });
});
