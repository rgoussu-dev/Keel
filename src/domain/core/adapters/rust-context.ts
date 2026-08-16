/**
 * `bounded-context/rust-context` adapter — the context
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
 */

import type { Adapter, ContributionPatch } from '../../contract/composition.js';
import { addedContext, CONTEXT_TAG } from './added-context.js';
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
} from './rust-module-layout.js';
import { eolOf, withEol } from '../util.js';

export const RUST_CONTEXT_ID = 'bounded-context/rust-context';

const TEMPLATE_ROOT = 'composition/bounded-context/rust-context/templates';

export const rustContextAdapter: Adapter = {
  id: RUST_CONTEXT_ID,
  vertical: 'bounded-context',
  covers: [],
  predicate: {
    requires: ['lang.rust', MODULITH_LAYOUT_TAG, CONTEXT_TAG],
  },
  // Ordering hints rather than requirements: under `keel add module`
  // the bootstraps have long since run, and listing them keeps the
  // adapter honest about what it patches into.
  after: [RUST_BOOTSTRAP_ID, RUST_CLI_BOOTSTRAP_ID, RUST_HTTP_BOOTSTRAP_ID],
  async contribute(ctx) {
    const added = addedContext(ctx.manifest, RUST_CONTEXT_ID);
    const { projectName } = rustBootstrapAnswers(ctx.manifest, RUST_CONTEXT_ID);
    const layout = rustLayout(ctx.manifest.tags, projectName);
    const crates = rustContextCrates(layout, added.name, added.consumes);
    const vars = templateVars(added);

    const rendered = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/context`, 'modules', vars),
      ...(added.consumes === null
        ? []
        : [ctx.templates.render(`${TEMPLATE_ROOT}/gateway`, `modules/${added.name}/infra`, vars)]),
      ...assembliesOf(ctx.manifest.tags).map((typology) => {
        const assembly = layout.assembly(typology);
        const dir = assembly.rootFile.slice(0, assembly.rootFile.lastIndexOf('/'));
        return ctx.templates.render(`${TEMPLATE_ROOT}/wiring`, dir, vars);
      }),
    ]);

    const members = [
      crates.contract,
      crates.core,
      crates.seam,
      ...(crates.gateway ? [crates.gateway] : []),
    ];
    const patches: ContributionPatch[] = [
      {
        target: 'Cargo.toml',
        apply: (existing) =>
          addWorkspaceMembers(
            existing,
            members.map((unit) => unit.crate.dir),
          ),
      },
    ];
    for (const typology of assembliesOf(ctx.manifest.tags)) {
      const assembly = layout.assembly(typology);
      patches.push({
        target: assembly.crate.manifest,
        apply: (existing) => addCrateDependencies(existing, deps(layout, added, members, assembly)),
      });
      patches.push(assemblyModulePatch(assembly.rootFile, added.name));
    }

    return { files: rendered.flat(), patches };
  },
};

/** What every template in this tree renders against. */
function templateVars(added: ReturnType<typeof addedContext>): Readonly<Record<string, string>> {
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

/** Which assemblies this project has, from the stack's arch tags. */
function assembliesOf(tags: readonly string[]): readonly string[] {
  const typologies: string[] = [];
  if (tags.includes('arch.cli')) typologies.push('cli');
  if (tags.includes('arch.server-http')) typologies.push('http');
  return typologies;
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
  layout: ReturnType<typeof rustLayout>,
  added: ReturnType<typeof addedContext>,
  members: readonly ReturnType<typeof rustContextCrates>['contract'][],
  assembly: ReturnType<ReturnType<typeof rustLayout>['assembly']>,
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
