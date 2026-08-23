/**
 * Stack registry.
 *
 * A `Stack` is a curated combination of capability tags and verticals
 * that produces a coherent greenfield project: pick one with
 * `keel new --stack=<id>` and the engine resolves everything from
 * there. Stacks are sugar — they don't add expressive power that the
 * underlying composition layer doesn't already have, they just spare
 * the user from naming every tag and vertical by hand.
 *
 * **The presets themselves are data.** Nothing in a `Stack` is code:
 * `tags` and `projects` are strings, and every other field is a
 * reference to something registered under an id — a vertical, a build
 * system, a module layout, a sibling stack. So they live in
 * `stack-presets.json` beside this module, and this module is the
 * schema that governs that file, the resolution of its references
 * against the registries, and the `Stack` type as the resolved
 * in-memory shape. Adding a stack is an edit to the data file; see
 * its header.
 *
 * The data is a JSON **module import**, not a file read, and that is
 * the whole reason it sits under `src/` rather than in `assets/`.
 * `getStack` and `listStacks` are synchronous everywhere they are
 * called — the CLI, the local UI, the wizard — so the registry has to
 * resolve at load; reading the file through the `TemplateSource` port
 * would make it async and infect every caller with a promise for a
 * table that never changes. A module import is a data dependency the
 * module system resolves, so the hexagon keeps its wall: no `node:fs`
 * in the domain, no port, no I/O. `tsc` emits the JSON into `dist/`
 * beside the code that reads it.
 *
 * A **composite stack** declares `services` instead of scaffolding in
 * place: each service is a full stack installed into its own
 * subdirectory (own tree, own manifest), and every service resolves
 * with its siblings' `projects` tags in scope as `peers` — so
 * peer-conditional adapters (an HTTP gateway in a frontend, a CORS
 * patch in a backend) are selected by the ordinary predicate
 * machinery. A composite stack's own `verticals` run at the product
 * root under the monorepo layout (and are skipped under polyrepo,
 * where no shared root exists).
 */

import { z } from 'zod';
import presetDocument from './stack-presets.json' with { type: 'json' };
import { getDeclaredVertical } from './verticals/index.js';
import { getModuleLayoutOption, type ModuleLayoutOption } from './adapters/module-layout.js';
import { assemblyRefusal } from './compatibility.js';
import type { Conflict, Tag, Vertical } from '../contract/composition.js';

/**
 * One selectable build system of a stack. The choice folds a `pkg.*`
 * capability tag into the manifest at install time; everything else
 * (which build-tool adapter fires, which build-file trees render) is
 * ordinary predicate machinery reading that tag.
 */
export interface BuildSystemOption {
  /** User-facing id, e.g. `gradle`, `maven`, `npm`, `pnpm`. */
  readonly id: string;
  /** The `pkg.*` tag the choice contributes. */
  readonly tag: Tag;
  /** One-line label shown as the interactive choice. */
  readonly label: string;
  /** Longer help text for the interactive prompt. */
  readonly doc: string;
}

/** Gradle as a selectable JVM build system. */
export const GRADLE_BUILD: BuildSystemOption = {
  id: 'gradle',
  tag: 'pkg.gradle',
  label: 'Gradle — incremental task-graph build (Kotlin DSL)',
  doc: 'Task DAG with incremental builds and caching; build scripts are code.',
};

/** Maven as a selectable JVM build system. */
export const MAVEN_BUILD: BuildSystemOption = {
  id: 'maven',
  tag: 'pkg.maven',
  label: 'Maven — convention-first declarative build (POM)',
  doc: 'Fixed lifecycle and declarative POMs; the conservative, predictable choice.',
};

/** npm as a selectable TypeScript workspace package manager. */
export const NPM_BUILD: BuildSystemOption = {
  id: 'npm',
  tag: 'pkg.npm',
  label: 'npm — the package manager bundled with Node',
  doc: 'Zero extra install; hoisted workspaces with the classic flat node_modules.',
};

/** pnpm as a selectable TypeScript workspace package manager. */
export const PNPM_BUILD: BuildSystemOption = {
  id: 'pnpm',
  tag: 'pkg.pnpm',
  label: 'pnpm — fast, strict, content-addressed installs',
  doc: 'Symlinked strict node_modules (no phantom dependencies) and workspace: protocol.',
};

/**
 * Every selectable build system, keyed by id — the lookup a stack
 * preset resolves `buildSystems: ["gradle", "maven"]` through.
 *
 * Flat across families on purpose: nothing stops a preset naming
 * `gradle` and `pnpm` together, and the thing that would make that
 * assembly illegal is a {@link Conflict}, declared by the piece that
 * owns the rule — never a partitioned table here.
 */
export const BUILD_SYSTEMS: Readonly<Record<string, BuildSystemOption>> = Object.freeze(
  Object.fromEntries(
    [GRADLE_BUILD, MAVEN_BUILD, NPM_BUILD, PNPM_BUILD].map((option) => [option.id, option]),
  ),
);

/** Returns the build system registered under `id`, or null if absent. */
export function getBuildSystem(id: string): BuildSystemOption | null {
  return BUILD_SYSTEMS[id] ?? null;
}

/** One service of a composite stack. */
export interface StackService {
  /** Directory the service is scaffolded into, relative to cwd. */
  readonly path: string;
  /** Id of the (non-composite) stack the service is built from. */
  readonly stack: string;
  /**
   * Verticals installed on top of the service stack's own list —
   * typically `gateway`, whose adapters only fire when peer tags are
   * in scope.
   */
  readonly extraVerticals?: readonly Vertical[];
}

/** A curated greenfield preset. */
export interface Stack {
  readonly id: string;
  readonly description: string;
  /** Capability tags this stack contributes to the manifest at install time. */
  readonly tags: readonly Tag[];
  /**
   * Build systems this stack can be scaffolded on; the first entry is
   * the default. Stacks declaring this omit the `pkg.*` tag from
   * `tags` — the install handler folds the chosen option's tag in.
   * Absent when the stack's `tags` already pin its only build system.
   */
  readonly buildSystems?: readonly BuildSystemOption[];
  /**
   * Module layouts this stack can be scaffolded on; the first entry
   * is the default. Stacks declaring this omit the `layout.*` tag
   * from `tags` — the install handler folds the chosen option's tag
   * in. Absent for stacks that ship a single layout, whose adapters
   * then resolve to `basic`.
   */
  readonly moduleLayouts?: readonly ModuleLayoutOption[];
  /** Verticals to install, in order. */
  readonly verticals: readonly Vertical[];
  /**
   * Peer tags this stack projects onto sibling services when composed
   * into a product (e.g. `peer.api.rest` for a REST backend). Declared
   * explicitly — never derived — so the tag vocabulary stays greppable.
   */
  readonly projects?: readonly Tag[];
  /** Present on composite stacks: the services to scaffold. */
  readonly services?: readonly StackService[];
  /**
   * Incompatibilities this preset's own combination of dials creates
   * — a build system its module layout cannot take, a capability its
   * framework will not carry.
   *
   * A stack's rules and a vertical's are read together, because an
   * assembly is the pieces coming together and neither piece alone
   * knows the whole of it. Declared here rather than centrally so a
   * preset arriving from outside this repository brings its own; the
   * schema below carries the field through unchanged, since a
   * `Conflict` is already pure data. @see Conflict
   */
  readonly conflicts?: readonly Conflict[];
}

/**
 * The wire shape of one preset in `stack-presets.json`, and the zod
 * schema that governs it.
 *
 * Validated the way `domain/contract/manifest.ts` validates a
 * manifest, and for the same reason: this is a **boundary**. The file
 * beside this module happens to be ours, but the shape it has to
 * satisfy is the shape a preset arriving from outside this repository
 * will have to satisfy too (roadmap #117), and a hand-rolled cast
 * over a third party's JSON is how a typo becomes an
 * `undefined is not iterable` three layers down. One schema serves
 * both, and it is the published contract for a preset author.
 */
const ConflictDataSchema = z.object({
  id: z.string().min(1),
  when: z.array(z.string().min(1)).nonempty(),
  unless: z.array(z.string().min(1)).nonempty().optional(),
  reason: z.string().min(1),
});

/** The wire shape of one service of a composite preset. */
const StackServiceDataSchema = z.object({
  path: z.string().min(1),
  stack: z.string().min(1),
  extraVerticals: z.array(z.string().min(1)).nonempty().optional(),
});

/**
 * The wire shape of one preset. Every reference is an id; the
 * optional lists are `nonempty` so "declares no dials" is spelled by
 * omission and cannot also be spelled by `[]`, which resolves to a
 * stack offering a choice of nothing.
 */
const StackPresetSchema = z.object({
  id: z.string().min(1),
  description: z.string().min(1),
  tags: z.array(z.string().min(1)),
  buildSystems: z.array(z.string().min(1)).nonempty().optional(),
  moduleLayouts: z.array(z.string().min(1)).nonempty().optional(),
  verticals: z.array(z.string().min(1)),
  projects: z.array(z.string().min(1)).nonempty().optional(),
  services: z.array(StackServiceDataSchema).nonempty().optional(),
  conflicts: z.array(ConflictDataSchema).nonempty().optional(),
});

/** The whole document. Unknown keys are dropped, `"//"` among them. */
export const StackPresetsSchema = z.object({
  presets: z.array(StackPresetSchema),
});

/** One preset as it is written down, before its references resolve. */
export type StackPreset = z.infer<typeof StackPresetSchema>;

/** The reference lists a preset can name something unregistered in. */
export type PresetField = 'id' | 'verticals' | 'buildSystems' | 'moduleLayouts' | 'services';

/** A preset that could not be resolved, and why. */
export interface PresetProblem {
  /** Id of the preset that did not resolve. */
  readonly preset: string;
  /** Which of its lists carried the unresolvable reference. */
  readonly field: PresetField;
  /** The id nothing is registered under. */
  readonly missing: string;
  /** One line naming the preset, the field and the id. */
  readonly message: string;
}

/** Resolved presets, and the ones that did not resolve. */
export interface PresetResolution {
  /** The presets whose every reference resolved, in document order. */
  readonly stacks: Readonly<Record<string, Stack>>;
  /** One entry per unresolvable reference; empty on a clean load. */
  readonly problems: readonly PresetProblem[];
}

/**
 * Validates a preset document and resolves each preset's references
 * against the registries this build carries.
 *
 * **A malformed document throws; a dangling reference does not.**
 * The two failures are different in kind, and conflating them would
 * get one of them wrong.
 *
 * A shape violation — `verticals` a string, `when` empty, no `id` —
 * is never a piece someone forgot to install. There is no partial
 * answer to give and nothing a caller could sensibly do with one, so
 * the schema throws, exactly as `parseManifest` does on a manifest
 * that is not a manifest.
 *
 * A reference to a vertical, build system or module layout that is
 * not registered is the opposite: the document is well-formed and the
 * *build* is missing a piece. Under plugins that will be routine and
 * legitimate — a preset from one plugin naming a vertical from
 * another the user chose not to install — and the useful answer there
 * is to drop that preset, keep the rest, and say which piece was
 * missing. So the preset is dropped and a {@link PresetProblem} is
 * recorded, every unresolvable reference of it, not just the first:
 * one run should name everything a user has to install.
 *
 * Which leaves the caller to decide what a problem means to it. For
 * keel's own {@link STACKS} it means a defect in this repository, so
 * the load below refuses to produce a registry at all — a built-in
 * preset silently vanishing from `keel new --list` is the one outcome
 * worse than a crash naming the id.
 */
export function resolveStackPresets(raw: unknown): PresetResolution {
  const document = StackPresetsSchema.parse(raw);
  const problems: PresetProblem[] = [];
  const seen = new Set<string>();
  const resolved: [string, Stack][] = [];
  for (const preset of document.presets) {
    if (seen.has(preset.id)) {
      problems.push(problem(preset.id, 'id', preset.id, 'is declared twice'));
      continue;
    }
    seen.add(preset.id);
    const stack = resolvePreset(preset, problems);
    if (stack !== null) resolved.push([stack.id, stack]);
  }
  // A Set and `fromEntries` rather than `id in obj` and an assignment:
  // the ids come off a document, and both of those read through
  // `Object.prototype` for one written `__proto__` or `toString`.
  return { stacks: Object.freeze(Object.fromEntries(resolved)), problems };
}

/** Builds one problem, message included. */
function problem(
  preset: string,
  field: PresetField,
  missing: string,
  complaint = 'is not registered',
): PresetProblem {
  return {
    preset,
    field,
    missing,
    message: `stack preset '${preset}': ${field} names '${missing}', which ${complaint}`,
  };
}

/**
 * Resolves one preset, or returns null having recorded why not.
 * Every reference is attempted even after the first failure, so the
 * problem list is the whole story rather than its first sentence.
 */
function resolvePreset(preset: StackPreset, problems: PresetProblem[]): Stack | null {
  const before = problems.length;
  const pick = <T>(
    ids: readonly string[],
    field: PresetField,
    lookup: (id: string) => T | null,
  ): readonly T[] =>
    ids.flatMap((id) => {
      const found = lookup(id);
      if (found === null) {
        problems.push(problem(preset.id, field, id));
        return [];
      }
      return [found];
    });

  const verticals = pick(preset.verticals, 'verticals', getDeclaredVertical);
  const buildSystems = preset.buildSystems
    ? pick(preset.buildSystems, 'buildSystems', getBuildSystem)
    : undefined;
  const moduleLayouts = preset.moduleLayouts
    ? pick(preset.moduleLayouts, 'moduleLayouts', getModuleLayoutOption)
    : undefined;
  const services = preset.services?.map((service) => ({
    path: service.path,
    stack: service.stack,
    ...(service.extraVerticals
      ? { extraVerticals: pick(service.extraVerticals, 'services', getDeclaredVertical) }
      : {}),
  }));

  if (problems.length > before) return null;
  return {
    id: preset.id,
    description: preset.description,
    tags: preset.tags,
    ...(buildSystems ? { buildSystems } : {}),
    ...(moduleLayouts ? { moduleLayouts } : {}),
    verticals,
    ...(preset.projects ? { projects: preset.projects } : {}),
    ...(services ? { services } : {}),
    ...(preset.conflicts ? { conflicts: preset.conflicts.map(resolveConflict) } : {}),
  };
}

/**
 * A {@link Conflict} is already pure data — an id, two tag-pattern
 * lists and a sentence — so it crosses the wire as itself. The only
 * work here is dropping an absent `unless` rather than carrying it as
 * `undefined`, which `exactOptionalPropertyTypes` distinguishes.
 */
function resolveConflict(conflict: z.infer<typeof ConflictDataSchema>): Conflict {
  return {
    id: conflict.id,
    when: conflict.when,
    ...(conflict.unless ? { unless: conflict.unless } : {}),
    reason: conflict.reason,
  };
}

/**
 * The registry, resolved from `stack-presets.json` at load.
 *
 * The presets are data, and this is where they become objects. Order
 * is the document's — `Object.values(STACKS)` yields presets in the
 * order they are written, which the wizard's grid reads; the id-sorted
 * views build on {@link listStackIds}.
 *
 * A problem here is a defect in this repository rather than a missing
 * optional install, so it is loud: keel's own data file naming a
 * piece keel does not define would otherwise drop a preset out of
 * `keel new --list` with nothing to show for it.
 * `tests/domain/core/stack-registry.test.ts` catches it in `verify`
 * first.
 */
const RESOLVED = resolveStackPresets(presetDocument);

if (RESOLVED.problems.length > 0) {
  throw new Error(
    [
      'stack-presets.json does not resolve against this build:',
      ...RESOLVED.problems.map((p) => `  ${p.message}`),
    ].join('\n'),
  );
}

export const STACKS: Readonly<Record<string, Stack>> = RESOLVED.stacks;

/** Returns the stack registered under `id`, or null if absent. */
export function getStack(id: string): Stack | null {
  return STACKS[id] ?? null;
}

/** Lists the available stack ids in deterministic order. */
export function listStackIds(): readonly string[] {
  return Object.keys(STACKS).sort();
}

/** One stack's id + description, for `keel new --list`. */
export interface StackSummary {
  readonly id: string;
  readonly description: string;
}

/** Lists every registered stack's id + description, in deterministic order. */
/**
 * The tag set a stack seeds, once its build-system and module-layout
 * dials have settled.
 *
 * The one place the arithmetic lives, because three readers need the
 * same answer: the install that stages from it, the compatibility
 * probe below, and the menus that filter against it.
 */
export function stackTagsFor(
  stack: Stack,
  buildTag: Tag | null,
  layoutTag: Tag | null,
): readonly Tag[] {
  return [...stack.tags, ...(buildTag ? [buildTag] : []), ...(layoutTag ? [layoutTag] : [])];
}

/**
 * Every tag set this stack could seed — one per combination of the
 * dials it offers, and exactly one when it offers none.
 *
 * The peer context is deliberately not an axis. It is opt-in and
 * defaults to off, so a stack that can only be assembled *with* it is
 * not a thing; whether it may be switched on is its own menu's
 * question, filtered by the same rules at that point.
 */
export function assemblies(stack: Stack): readonly (readonly Tag[])[] {
  const builds: readonly (Tag | null)[] = stack.buildSystems?.map((o) => o.tag) ?? [null];
  const layouts: readonly (Tag | null)[] = stack.moduleLayouts?.map((o) => o.tag) ?? [null];
  return builds.flatMap((build) => layouts.map((layout) => stackTagsFor(stack, build, layout)));
}

/**
 * Whether this stack can be built at all — whether **some** setting of
 * its dials satisfies the rules its own pieces declare.
 *
 * What it is for is menus, and the "some" is the whole of it. A stack
 * is a dead end only when every way of assembling it is refused;
 * hiding one whose default combination happens to be illegal would
 * take away a preset the user could have reached by moving a dial. The
 * dials' own menus then narrow within it, which is where a specific
 * combination is ruled out.
 *
 * @see assemblyRefusal — the same declaration, read to refuse rather
 * than to filter.
 */
export function isAssemblable(stack: Stack): boolean {
  const pieces = [stack, ...stack.verticals];
  return assemblies(stack).some((tags) => assemblyRefusal(pieces, tags) === null);
}

/** The stacks a menu may offer: every registered one that can be built. */
export function assemblableStacks(): readonly Stack[] {
  return listStackIds()
    .map((id) => STACKS[id])
    .filter((stack): stack is Stack => stack !== undefined && isAssemblable(stack));
}

/**
 * Every stack a menu may offer, id-sorted.
 *
 * Filtered by {@link isAssemblable}: a preset no setting of its dials
 * can build is not an option, and listing it as one is a promise the
 * install would break. {@link listStackIds} stays unfiltered — an
 * "unknown stack 'x'; available: …" message is about which ids exist,
 * and hiding a real id there would send the reader looking for a typo
 * they did not make.
 */
export function listStacks(): readonly StackSummary[] {
  return assemblableStacks().map((stack) => ({ id: stack.id, description: stack.description }));
}
