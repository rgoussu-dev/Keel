/**
 * `bounded-context/rust-context` and its wiring adapters — the context
 * `keel add module <name>` emits under the Rust modulith, and the
 * gateway `--consumes <other>` adds to it.
 *
 * **Four crates where the peer context has three.** The
 * `--with-peer-context` context is a pure consumer: contract face,
 * core, gateway, and no seam, because nothing in the emitted project
 * ever consumes *it*. An added context gets a
 * `user-side/service` as well, and that is the difference that makes
 * `keel add module` compose with itself — `keel add module shipping
 * --consumes ordering` is the obvious second command, and it needs
 * `ordering` to have published a seam when it was added.
 *
 * **The seam is spelled like the skeleton's on purpose.** `greeting`
 * publishes `GreetingService::greeting_for(&str) -> Result<Greeting,
 * GreetingUnavailable>`; an added `ordering` publishes
 * `OrderingService::ordering_for(&str) -> Result<Ordering,
 * OrderingUnavailable>`. Same shape, this context's name in it. The
 * payoff is in the gateway: one template renders an edge to *any*
 * context, keel's own skeleton included, with no table mapping each
 * context to how its seam happens to be spelled. That table is the
 * thing that would go stale the first time somebody hand-edited a
 * seam, and there is no version of this feature where maintaining it
 * is cheaper than agreeing on the shape.
 *
 * **The use case is a placeholder and says so.** keel knows the
 * context's name and nothing about its purpose, so
 * `<Name>Command { subject }` is a stand-in with the right shape and a
 * doc comment telling the user to rename it. What is *not* a
 * placeholder is everything around it: the driving port, the error
 * type this context owns, the seam's own DTOs, and the fact that no
 * crate here names another context except through that context's seam.
 *
 * **The driving port is `<Name>Port`, not `<Name>`.** The seam crate
 * owns a DTO called `<Name>`, and the seam's own `lib.rs` imports the
 * driving port — one file naming both, so one of them has to give.
 * `greeting` sidesteps this with an agent noun (`Greeter` beside
 * `Greeting`) and an agent noun is exactly what cannot be derived from
 * an arbitrary context name.
 *
 * **A shell, and one wiring adapter per entrypoint.** The shell writes
 * the context's crates and its gateway, and adds them to the
 * workspace's `members`, none of which an entrypoint shapes;
 * `rust-context-cli` and `rust-context-http` each write one assembly's
 * wiring module, declare it in that assembly's `main.rs` and add the
 * context's crates to that assembly's `Cargo.toml`, and require that
 * entrypoint's tag. A project carrying both matches both. What each
 * writes is the same module in another crate, so which assemblies a
 * context is wired into is read off the predicates, never off the tags
 * inside `contribute()` — and `keel add entrypoint` wires every
 * context into the new assembly by installing the one wiring adapter
 * that newly matches (roadmap R.3b).
 */

import type { Adapter, ContributionPatch, ManifestV2, Tag } from '../../contract/composition.js';
import { addedContext, CONTEXT_TAG, type AddedContext } from './added-context.js';
import { MODULITH_LAYOUT_TAG, SKELETON_MODULE } from './module-layout.js';
import { RUST_BOOTSTRAP_ID, rustBootstrapAnswers } from './rust-bootstrap.js';
import { RUST_CLI_BOOTSTRAP_ID } from './rust-cli-bootstrap.js';
import { RUST_HTTP_BOOTSTRAP_ID } from './rust-http-bootstrap.js';
import {
  addCrateDependencies,
  addWorkspaceMembers,
  rustContextCrates,
  rustLayout,
  rustSeamCrate,
  toCrateIdent,
  type RustLayoutPaths,
  type RustUnit,
} from './rust-module-layout.js';
import { eolOf, withEol } from '../util.js';

export const RUST_CONTEXT_ID = 'bounded-context/rust-context';
/** The adapter wiring an added context into the CLI's assembly. */
export const RUST_CONTEXT_CLI_ID = 'bounded-context/rust-context-cli';
/** The adapter wiring an added context into the HTTP server's assembly. */
export const RUST_CONTEXT_HTTP_ID = 'bounded-context/rust-context-http';

const TEMPLATE_ROOT = 'composition/bounded-context/rust-context/templates';

/** The shell: the context's crates, its gateway under `--consumes`, and their workspace membership. */
export const rustContextAdapter: Adapter = {
  id: RUST_CONTEXT_ID,
  vertical: 'bounded-context',
  covers: [],
  predicate: {
    requires: ['lang.rust', MODULITH_LAYOUT_TAG, CONTEXT_TAG],
  },
  // An ordering hint rather than a requirement: under `keel add module`
  // the bootstrap has long since run, and listing it keeps the shell
  // honest about the root manifest it patches.
  after: [RUST_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { added, members, vars } = contextOf(ctx.manifest, RUST_CONTEXT_ID);
    const rendered = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/context`, 'modules', vars),
      ...(added.consumes === null
        ? []
        : [ctx.templates.render(`${TEMPLATE_ROOT}/gateway`, `modules/${added.name}/infra`, vars)]),
    ]);
    return {
      files: rendered.flat(),
      patches: [
        {
          target: 'Cargo.toml',
          apply: (existing) =>
            addWorkspaceMembers(
              existing,
              members.map((unit) => unit.crate.dir),
            ),
        },
      ],
    };
  },
};

/** Wires the context into the CLI's assembly, `application/cli`. */
export const rustContextCliAdapter: Adapter = wiringAdapter(
  RUST_CONTEXT_CLI_ID,
  'cli',
  'arch.cli',
  RUST_CLI_BOOTSTRAP_ID,
);

/** Wires the context into the HTTP server's assembly, `application/http`. */
export const rustContextHttpAdapter: Adapter = wiringAdapter(
  RUST_CONTEXT_HTTP_ID,
  'http',
  'arch.server-http',
  RUST_HTTP_BOOTSTRAP_ID,
);

/**
 * The adapter that wires the context into the assembly of the
 * deployment unit `unit` — `src/<name>.rs`, its `mod` line in
 * `main.rs`, and the context's crates in that assembly's `Cargo.toml`
 * — on a project carrying `entrypoint`, after the shell and that
 * entrypoint's bootstrap.
 */
function wiringAdapter(id: string, unit: string, entrypoint: Tag, bootstrap: string): Adapter {
  return {
    id,
    vertical: 'bounded-context',
    covers: [],
    predicate: {
      requires: ['lang.rust', MODULITH_LAYOUT_TAG, CONTEXT_TAG, entrypoint],
    },
    after: [RUST_CONTEXT_ID, bootstrap],
    async contribute(ctx) {
      const { added, layout, members, vars } = contextOf(ctx.manifest, id);
      const assembly = layout.assembly(unit);
      const dir = assembly.rootFile.slice(0, assembly.rootFile.lastIndexOf('/'));
      return {
        files: await ctx.templates.render(`${TEMPLATE_ROOT}/wiring`, dir, vars),
        patches: [
          {
            target: assembly.crate.manifest,
            apply: (existing) =>
              addCrateDependencies(existing, deps(layout, added, members, assembly)),
          },
          assemblyModulePatch(assembly.rootFile, added.name),
        ],
      };
    },
  };
}

/**
 * The context an add-module run emits, and what its adapters read: the
 * layout, the context's own crates, and the template variables — the
 * same values for the shell and for each assembly's wiring.
 */
function contextOf(
  manifest: ManifestV2,
  requesterId: string,
): {
  readonly added: AddedContext;
  readonly layout: RustLayoutPaths;
  readonly members: readonly RustUnit[];
  readonly vars: Readonly<Record<string, string>>;
} {
  const added = addedContext(manifest, requesterId);
  const { projectName } = rustBootstrapAnswers(manifest, requesterId);
  const layout = rustLayout(manifest.tags, projectName);
  const crates = rustContextCrates(layout, added.name, added.consumes);
  const members = [
    crates.contract,
    crates.core,
    crates.seam,
    ...(crates.gateway ? [crates.gateway] : []),
  ];
  return { added, layout, members, vars: templateVars(added) };
}

/** What every template in this tree renders against. */
function templateVars(added: AddedContext): Readonly<Record<string, string>> {
  return {
    module: added.name,
    Module: pascal(added.name),
    moduleIdent: toCrateIdent(added.name),
    consumes: added.consumes ?? '',
    Consumes: added.consumes === null ? '' : pascal(added.consumes),
    consumesIdent: added.consumes === null ? '' : toCrateIdent(added.consumes),
    ...seamAccess(added.consumes),
    // ejs has no truthiness helper of its own worth trusting across
    // versions, and `consumes` is '' rather than absent so the path
    // token substitutes cleanly. A separate flag keeps the templates
    // reading `if (hasConsumes)` rather than comparing to ''.
    hasConsumes: added.consumes === null ? '' : '1',
  };
}

/**
 * How the wiring module gets hold of the consumed context's seam.
 *
 * **The skeleton's seam self-assembles and no added context's can.**
 * `greeting`'s core takes no dependencies, so
 * `new_greeting_service()` needs no arguments and the consumer can
 * call it directly. An added context's seam is built over that
 * context's *core*, which may itself hold a gateway to a third
 * context — `keel add module shipping --consumes ordering` where
 * `ordering` already consumes `greeting` is the case that proves it —
 * so its constructor takes the core, and the only place that knows how
 * to build one is the context's own wiring module in this assembly.
 *
 * Hence the branch, and hence it is keyed on {@link SKELETON_MODULE}
 * rather than on anything softer: that constant *is* the name of the
 * one context keel emits with a dependency-free core.
 *
 * Verified by compiling three contexts, which is the shape that
 * catches it — with two, the consumed context is always the skeleton
 * and the missing argument never shows up.
 */
function seamAccess(consumes: string | null): Readonly<Record<string, string>> {
  if (consumes === null) return { consumesSeamUse: '', consumesSeamExpr: '' };
  const ident = toCrateIdent(consumes);
  if (consumes === SKELETON_MODULE) {
    return {
      consumesSeamUse: `use ${ident}_user_side_service::new_${ident}_service;`,
      consumesSeamExpr: `new_${ident}_service()`,
    };
  }
  return { consumesSeamUse: '', consumesSeamExpr: `crate::${ident}::wire_service()` };
}

/**
 * The context name as a Rust type prefix.
 *
 * One `toUpperCase` on the first character is the whole job, and it is
 * correct rather than merely adequate: {@link parseModuleName} admits
 * only `[a-z][a-z0-9]*`, so there is no separator to case-split on and
 * no character whose uppercase form is more than one char.
 */
function pascal(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

/**
 * The dependencies an assembly needs to wire the new context.
 *
 * `platform-kernel` is in here because the emitted wiring test blocks
 * on a future, and the modulith assembly does not declare the kernel
 * on its own. {@link addCrateDependencies} makes that safe to repeat:
 * the second added context finds the key already there and adds only
 * its own crates.
 *
 * The consumed context's **seam** is listed, and its domain
 * deliberately is not: an assembly may legitimately name both
 * contexts, but the wiring module is written against the seam so that
 * copying it into a gateway does not carry a domain edge along.
 */
function deps(
  layout: RustLayoutPaths,
  added: AddedContext,
  members: readonly RustUnit[],
  assembly: RustUnit,
): readonly (readonly [string, string])[] {
  const entries: (readonly [string, string])[] = [
    [layout.kernel.crate.name, layout.kernel.crate.pathFrom(assembly.crate)],
    ...members.map(
      (unit) => [unit.crate.name, unit.crate.pathFrom(assembly.crate)] as readonly [string, string],
    ),
  ];
  if (added.consumes !== null) {
    const seam = rustSeamCrate(layout, added.consumes);
    entries.push([seam.crate.name, seam.crate.pathFrom(assembly.crate)]);
  }
  return entries;
}

/**
 * Declares the wiring module in the assembly's root. Rust will not
 * compile a file nobody declared, so omitting this leaves the context
 * emitted, compiled as a workspace member, and wired into nothing.
 */
function assemblyModulePatch(target: string, context: string): ContributionPatch {
  const marker = `mod ${context};`;
  return {
    target,
    apply: (existing) => {
      if (existing.includes(marker)) return existing;
      const anchor = existing.indexOf('\n\n');
      if (anchor === -1) {
        return `${existing.trimEnd()}${withEol(`\n\n${marker}\n`, eolOf(existing))}`;
      }
      return `${existing.slice(0, anchor)}\n${marker}${existing.slice(anchor)}`;
    },
  };
}
