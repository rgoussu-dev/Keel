/**
 * `bounded-context/go-context` and its wiring adapters — the context
 * `keel add module <name>` emits under the Go modulith, and the
 * gateway `--consumes <other>` adds to it.
 *
 * **Go's alias hazard becomes real at two contexts here, not three.**
 * Every context spells its seam `package service`, so a file naming
 * two of them has two `service` identifiers and does not compile.
 * `go-peer-context` reaches only greeting's seam and aliases that one;
 * an *added* context publishes a seam of its own, so its wiring file
 * names two the moment `--consumes` is given. `goLayout`'s module doc
 * has warned about this since the dial landed, and the warning
 * expected three contexts to trigger it — a seam-bearing added context
 * brings it forward by one.
 *
 * The answer is to alias **every** seam import as `<context>service`
 * rather than only the one that collides. Aliasing on collision is a
 * rule someone has to apply correctly each time; aliasing always is a
 * rule the emitter cannot get wrong, and it reads better besides —
 * `greetingservice.Greeting` says whose DTO crossed.
 *
 * **Two things Go does that no other family does.** Binding is by
 * directory: a file in a `cmd/` directory joins that package by
 * existing, so unlike Rust's `mod` and the JVM's component scan there
 * is no declaration to patch and these adapters emit **no patch at
 * all**. And the wiring filename is the context's — `cmd/<unit>/
 * <name>.go` — which is what stops two added contexts colliding on the
 * fixed `guestbook.go` the peer adapter writes.
 *
 * **A shell, and one wiring adapter per entrypoint.** The shell writes
 * the context's own packages and its gateway, which no entrypoint
 * shapes; `go-context-cli` and `go-context-http` each write one
 * assembly's wiring file and its test, and require that entrypoint's
 * tag. A project carrying both matches both. What each writes is the
 * same file in another directory, so which assemblies a context is
 * wired into is read off the predicates, never off the tags inside
 * `contribute()` — and `keel add entrypoint` wires every context into
 * the new assembly by installing the one wiring adapter that newly
 * matches (roadmap R.3a).
 *
 * **No driving adapter.** `guestbook` ships `userside/signing` because
 * the emitted main drives it and a main cannot name
 * `domain.SignCommand`. Nothing drives an added context until the user
 * decides how, so keel emits no adapter for a decision it has not been
 * told; the wiring exposes the context's seam instead, which is both
 * nameable from the assembly and what a peer will want.
 */

import type { Adapter, ManifestV2, Tag } from '../../contract/composition.js';
import { addedContext, CONTEXT_TAG, type AddedContext } from './added-context.js';
import { goBootstrapAnswers } from './go-bootstrap.js';
import { GO_CLI_BOOTSTRAP_ID } from './go-cli-bootstrap.js';
import { GO_HTTP_BOOTSTRAP_ID } from './go-http-bootstrap.js';
import {
  goContextPackages,
  goLayout,
  goSeamPackage,
  SKELETON_FACADE_FACTORY,
  type GoLayoutPaths,
} from './go-module-layout.js';
import { MODULITH_LAYOUT_TAG, SKELETON_MODULE } from './module-layout.js';

export const GO_CONTEXT_ID = 'bounded-context/go-context';
/** The adapter wiring an added context into the CLI's assembly. */
export const GO_CONTEXT_CLI_ID = 'bounded-context/go-context-cli';
/** The adapter wiring an added context into the HTTP server's assembly. */
export const GO_CONTEXT_HTTP_ID = 'bounded-context/go-context-http';

const TEMPLATE_ROOT = 'composition/bounded-context/go-context/templates';

/** The shell: the context's own packages, and its gateway under `--consumes`. */
export const goContextAdapter: Adapter = {
  id: GO_CONTEXT_ID,
  vertical: 'bounded-context',
  covers: [],
  predicate: {
    requires: ['lang.go', MODULITH_LAYOUT_TAG, CONTEXT_TAG],
  },
  async contribute(ctx) {
    const { added, vars } = contextOf(ctx.manifest, GO_CONTEXT_ID);
    const pkg = goContextPackages(added.name, added.consumes);
    const rendered = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/context`, 'internal/modules', vars),
      ...(pkg.gateway === null
        ? []
        : [
            ctx.templates.render(
              `${TEMPLATE_ROOT}/gateway`,
              `internal/modules/${added.name}/infra`,
              vars,
            ),
          ]),
    ]);
    return { files: rendered.flat() };
  },
};

/** Wires the context into the CLI's assembly, `cmd/cli`. */
export const goContextCliAdapter: Adapter = wiringAdapter(
  GO_CONTEXT_CLI_ID,
  'cli',
  'arch.cli',
  GO_CLI_BOOTSTRAP_ID,
);

/** Wires the context into the HTTP server's assembly, `cmd/http`. */
export const goContextHttpAdapter: Adapter = wiringAdapter(
  GO_CONTEXT_HTTP_ID,
  'http',
  'arch.server-http',
  GO_HTTP_BOOTSTRAP_ID,
);

/**
 * The adapter that wires the context into the assembly of the
 * deployment unit `unit` — `cmd/<unit>/<name>.go` and its test — on a
 * project carrying `entrypoint`, after the shell and that entrypoint's
 * bootstrap.
 */
function wiringAdapter(id: string, unit: string, entrypoint: Tag, bootstrap: string): Adapter {
  return {
    id,
    vertical: 'bounded-context',
    covers: [],
    predicate: {
      requires: ['lang.go', MODULITH_LAYOUT_TAG, CONTEXT_TAG, entrypoint],
    },
    after: [GO_CONTEXT_ID, bootstrap],
    async contribute(ctx) {
      const { layout, vars } = contextOf(ctx.manifest, id);
      return {
        files: await ctx.templates.render(
          `${TEMPLATE_ROOT}/wiring`,
          dirOf(layout.main(unit)),
          vars,
        ),
      };
    },
  };
}

/**
 * The context an add-module run emits, and what its templates read: the
 * layout, and every import block with each seam path aliased by its
 * context — the same values for the shell and for each assembly's
 * wiring.
 */
function contextOf(
  manifest: ManifestV2,
  requesterId: string,
): {
  readonly added: AddedContext;
  readonly layout: GoLayoutPaths;
  readonly vars: Record<string, string>;
} {
  const added = addedContext(manifest, requesterId);
  const { modulePath } = goBootstrapAnswers(manifest, requesterId);
  const layout = goLayout(manifest.tags, modulePath);
  const pkg = goContextPackages(added.name, added.consumes);
  const seamAlias = aliasOf(added.name);
  const consumedSeam = added.consumes === null ? null : goSeamPackage(layout, added.consumes);
  const consumedAlias = added.consumes === null ? '' : aliasOf(added.consumes);

  /** An import block with every seam path aliased by its context. */
  const imports = (dirs: readonly string[]): string =>
    layout
      .importBlock(dirs)
      .split('\n')
      .map((line) => alias(line, pkg.seam, seamAlias, layout))
      .map((line) =>
        consumedSeam === null ? line : alias(line, consumedSeam, consumedAlias, layout),
      )
      .join('\n');

  const vars: Record<string, string> = {
    module: added.name,
    Module: pascal(added.name),
    consumes: added.consumes ?? '',
    Consumes: added.consumes === null ? '' : pascal(added.consumes),
    hasConsumes: added.consumes === null ? '' : '1',
    seamAlias,
    consumesSeamAlias: consumedAlias,
    consumedSeamExpr: consumedSeamExpr(added.consumes, consumedAlias),
    facadeImports: imports([pkg.domain]),
    domainImports: imports([pkg.domainCore]),
    domainTestImports: imports([pkg.domain]),
    seamImports: imports([pkg.domain]),
    // The seam's own test builds it over a fake driving port, so it
    // names the domain rather than the facade — legal because
    // `internal/` is scoped to this context's root, not to `domain`.
    seamTestImports: imports([pkg.domain, pkg.seam]),
    gatewayImports: consumedSeam === null ? '' : imports([consumedSeam]),
    gatewayTestImports:
      consumedSeam === null || pkg.gateway === null ? '' : imports([consumedSeam, pkg.gateway]),
    wiringImports: imports(wiringDirs(pkg, consumedSeam, added.consumes)),
  };
  return { added, layout, vars };
}

/**
 * How the wiring gets hold of the consumed context's seam.
 *
 * The skeleton's is built straight from its facade —
 * `greetingservice.New(greeting.NewGreeter())` — because greeting's
 * facade constructor takes no arguments. An added context's may take a
 * gateway to a *third* context, so the only thing that knows how to
 * build one is that context's own wiring function, which sits in this
 * same `package main` and is therefore callable unqualified.
 */
function consumedSeamExpr(consumes: string | null, alias: string): string {
  if (consumes === null) return '';
  if (consumes === SKELETON_MODULE) {
    return `${alias}.New(${consumes}.${SKELETON_FACADE_FACTORY}())`;
  }
  return `wire${pascal(consumes)}Service()`;
}

/** Which project packages the wiring file imports. */
function wiringDirs(
  pkg: ReturnType<typeof goContextPackages>,
  consumedSeam: string | null,
  consumes: string | null,
): readonly string[] {
  const dirs = [pkg.facade, pkg.seam];
  if (pkg.gateway !== null) dirs.push(pkg.gateway);
  // Only the skeleton's seam is named here, and only because this
  // file builds it: `greetingservice.New(greeting.NewGreeter())`
  // spells both packages. An added context's seam arrives already
  // built from that context's `wire<Name>Service()` in this same
  // package, so this file never writes its name — and an import Go
  // sees unused is a compile error, not a warning.
  if (consumedSeam !== null && consumes === SKELETON_MODULE) {
    dirs.push(consumedSeam, goContextPackages(consumes, null).facade);
  }
  return dirs;
}

/**
 * Rewrites one gofmt-ordered import line to carry an alias.
 *
 * Applied *after* the block is ordered, in that order and not the
 * other way round: gofmt sorts by import path, never by the name a
 * file calls it, so deriving first and decorating second is what keeps
 * the emitted block and gofmt agreeing.
 */
function alias(line: string, dir: string, as: string, layout: GoLayoutPaths): string {
  const quoted = `"${layout.importPath(dir)}"`;
  return line.includes(quoted) ? line.replace('"', `${as} "`) : line;
}

/** The alias a context's seam is imported under, everywhere. */
function aliasOf(context: string): string {
  return `${context}service`;
}

/** The context name as a Go exported-identifier prefix. */
function pascal(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/** The directory holding a `cmd/<typology>/main.go`. */
function dirOf(mainFile: string): string {
  return mainFile.slice(0, mainFile.lastIndexOf('/'));
}
