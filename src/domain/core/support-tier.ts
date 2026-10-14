/**
 * The support tier's facts and rules (roadmap epic T, T.2b): how far
 * keel vouches for one dial cell, read off what the e2e suites build.
 *
 * **The facts** are `support-tier.json` beside this module, rows of the
 * form _suite S builds cell C_, with every dial spelled out, so a
 * default that moves never moves a claim. It is loaded and validated
 * as the stack table is: a JSON module import, read once, and a shape
 * the schema refuses throws at load. A product row names the services
 * its suite compiles; its suite fakes the build of the others.
 *
 * **The rules** read the facts in order, and {@link supportOf} answers
 * from the first that holds:
 *
 *  1. a row naming the cell;
 *  2. P1, the harness twin: a single-service cell without the agent
 *     harness is its twin with it, less the agent files, so the suite
 *     that builds the twin builds it;
 *  3. P2, a product's services: a service's files depend only on its
 *     {@link serviceKeys} key — its stack, build system, repository
 *     layout, extras and its siblings' `projects` — so a suite that
 *     builds one product's service builds every service with that key.
 *
 * A cell no row and no rule proves is best-effort. Both premises were
 * measured on every cell before they were encoded, and
 * `tests/support-tier.premises.test.ts` holds them there.
 *
 * **Handed in, never imported.** The rules read a {@link SupportSource}
 * — the facts, and the stacks keel vouches for — and never `STACKS`, as
 * a handler never reads it (`AGENTS.md` → Registration). `registry.ts`
 * builds keel's own beside the registry (`shippedSupport`), for the
 * composition root to hand to the handlers that show a tier as it hands
 * them the registry, so their tests choose their own facts. A stack the
 * source does not vouch for, a plugin's, has no tier.
 */

import { z } from 'zod';
import factsDocument from './support-tier.json' with { type: 'json' };
import type { Stack } from '../contract/stack.js';
import type {
  CellSupport,
  DialCell,
  ProductCell,
  SingleCell,
  SupportProof,
} from '../contract/support-tier.js';

/**
 * One row of `singles`: a suite, and the single-service cell it builds.
 * Strict, so a misspelt dial is refused rather than read as a default.
 */
const SingleFactSchema = z
  .object({
    suite: z.string().min(1),
    stack: z.string().min(1),
    buildSystem: z.string().min(1).nullable(),
    moduleLayout: z.string().min(1).nullable(),
    peerContext: z.boolean(),
    agentHarness: z.boolean(),
  })
  .strict();

/** One row of `products`: a suite, the product cell it scaffolds and the services it compiles. */
const ProductFactSchema = z
  .object({
    suite: z.string().min(1),
    stack: z.string().min(1),
    layout: z.enum(['monorepo', 'polyrepo']),
    buildSystem: z.string(),
    builds: z.array(z.string().min(1)).nonempty(),
  })
  .strict();

/** The whole document. Unknown keys are dropped, `"//"` among them. */
const SupportFactsSchema = z.object({
  singles: z.array(SingleFactSchema),
  products: z.array(ProductFactSchema),
});

/** What the e2e suites build, as `support-tier.json` records it. */
export type SupportFacts = z.infer<typeof SupportFactsSchema>;

/** A suite, and the single-service cell it builds. */
export type SingleFact = SupportFacts['singles'][number];

/** A suite, the product cell it scaffolds, and the services of it the suite compiles. */
export type ProductFact = SupportFacts['products'][number];

/**
 * What the rules read: the facts, and the stacks keel vouches for,
 * whose ids say which cells have a tier at all and whose services a
 * product cell is read by.
 */
export interface SupportSource {
  readonly facts: SupportFacts;
  readonly stacks: readonly Stack[];
}

/**
 * Validates a facts document.
 *
 * @throws ZodError where its shape is not the schema's.
 */
export function supportFactsOf(raw: unknown): SupportFacts {
  return SupportFactsSchema.parse(raw);
}

/**
 * The facts keel ships, from `support-tier.json`. A malformed file is
 * a defect in this repository, so it throws at load.
 */
export const SHIPPED_SUPPORT_FACTS: SupportFacts = supportFactsOf(factsDocument);

/**
 * How far `source` vouches for `cell`, or null where it does not vouch
 * for the cell's stack or for a product's service's, or where the cell
 * is of the other kind than its stack (a single-service cell of a
 * product, or the reverse).
 *
 * `cell` must be one `keel.dials` settled: a caller settles it first.
 * A cell it never settles to has no tier, since `keel new` refuses it,
 * but this does not read the dials again to say so — handed one, it
 * answers best-effort, as no row proves it.
 */
export function supportOf(cell: DialCell, source: SupportSource): CellSupport | null {
  const stack = source.stacks.find((candidate) => candidate.id === cell.stack);
  if (stack === undefined) return null;
  if (cell.kind === 'single') {
    return stack.services === undefined ? singleSupport(cell, source.facts.singles) : null;
  }
  return stack.services === undefined ? null : productSupport(cell, source);
}

/**
 * Each service of a product cell, by its path, to the key P2 reads it
 * by: its stack, its build system on this cell, the repository layout,
 * the extras the product gives it, and the `projects` its siblings
 * project onto it. Two services with one key have the same files, the
 * premise `tests/support-tier.premises.test.ts` holds on every product
 * cell. Null where `stacks` lacks the product or one of its services'
 * stacks.
 */
export function serviceKeys(
  cell: ProductCell,
  stacks: readonly Stack[],
): ReadonlyMap<string, string> | null {
  const byId = new Map(stacks.map((stack) => [stack.id, stack]));
  const services = byId.get(cell.stack)?.services;
  if (services === undefined) return null;
  if (services.some((service) => !byId.has(service.stack))) return null;
  const builds = buildPairs(cell.buildSystem);
  const keys = new Map<string, string>();
  for (const service of services) {
    const peers = new Set<string>();
    for (const sibling of services) {
      if (sibling === service) continue;
      for (const tag of byId.get(sibling.stack)?.projects ?? []) peers.add(tag);
    }
    keys.set(
      service.path,
      JSON.stringify([
        service.stack,
        builds.get(service.path) ?? null,
        cell.layout,
        (service.extraVerticals ?? []).map((vertical) => vertical.id),
        [...peers].sort(),
      ]),
    );
  }
  return keys;
}

function singleSupport(cell: SingleCell, facts: readonly SingleFact[]): CellSupport {
  const row = facts.find((fact) => sameSingle(fact, cell));
  if (row !== undefined) return firstClass({ by: 'suite', suite: row.suite });
  if (!cell.agentHarness) {
    const twin = facts.find((fact) => sameSingle(fact, { ...cell, agentHarness: true }));
    if (twin !== undefined) return firstClass({ by: 'harness-twin', suite: twin.suite });
  }
  return { tier: 'best-effort', proof: null, unbuilt: [] };
}

function productSupport(cell: ProductCell, source: SupportSource): CellSupport | null {
  const keys = serviceKeys(cell, source.stacks);
  if (keys === null) return null;
  const row = source.facts.products.find((fact) => sameProduct(factCell(fact), cell));
  const suites: Record<string, string> = {};
  const unbuilt: string[] = [];
  for (const [path, key] of keys) {
    const suite = row?.builds.includes(path) ? row.suite : builtElsewhere(key, source);
    if (suite === null) unbuilt.push(path);
    else suites[path] = suite;
  }
  return {
    tier: unbuilt.length === 0 ? 'first-class' : 'best-effort',
    proof: Object.keys(suites).length === 0 ? null : { by: 'services', suites },
    unbuilt,
  };
}

/** The suite of the first product row compiling a service whose key is `key` (P2), or null. */
function builtElsewhere(key: string, source: SupportSource): string | null {
  for (const fact of source.facts.products) {
    const keys = serviceKeys(factCell(fact), source.stacks);
    if (fact.builds.some((path) => keys?.get(path) === key)) return fact.suite;
  }
  return null;
}

function firstClass(proof: SupportProof): CellSupport {
  return { tier: 'first-class', proof, unbuilt: [] };
}

function factCell(fact: ProductFact): ProductCell {
  return { kind: 'product', stack: fact.stack, layout: fact.layout, buildSystem: fact.buildSystem };
}

function sameSingle(fact: SingleFact, cell: SingleCell): boolean {
  return (
    fact.stack === cell.stack &&
    fact.buildSystem === cell.buildSystem &&
    fact.moduleLayout === cell.moduleLayout &&
    fact.peerContext === cell.peerContext &&
    fact.agentHarness === cell.agentHarness
  );
}

function sameProduct(a: ProductCell, b: ProductCell): boolean {
  const left = buildPairs(a.buildSystem);
  const right = buildPairs(b.buildSystem);
  return (
    a.stack === b.stack &&
    a.layout === b.layout &&
    left.size === right.size &&
    [...left].every(([path, id]) => right.get(path) === id)
  );
}

function buildPairs(spelled: string): ReadonlyMap<string, string> {
  const pairs = new Map<string, string>();
  for (const pair of spelled.split(',')) {
    const separator = pair.indexOf('=');
    if (separator > 0) pairs.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return pairs;
}
