/**
 * What each e2e suite claims to scaffold, spelled as the paths golden
 * keys a `keel new` cell (roadmap T.2c).
 *
 * A proving suite claims the cells of its rows in
 * `src/domain/core/support-tier.json`; a suite with a role claims the
 * cells its role says it seeds (`e2e-roles.ts`). Both are read here,
 * with no side effect, so `support-tier.test.ts` spells a row as the
 * e2e job's check does: `e2e-cell.ts` holds a running suite to these
 * claims, and `support-tier.test.ts` holds them to the paths golden.
 */

import type { NewProjectCommand, NewProjectTarget } from '../../src/domain/contract/commands.js';
import {
  SHIPPED_SUPPORT_FACTS,
  type ProductFact,
  type SingleFact,
} from '../../src/domain/core/support-tier.js';
import { E2E_ROLES } from './e2e-roles.js';
import { newProjectCommandLine } from './paths-golden.js';

/** A row's cell as the `keel new` target that scaffolds it, every dial set. */
export function factTarget(row: SingleFact | ProductFact): NewProjectTarget {
  if ('builds' in row) {
    return {
      kind: 'new-project',
      stack: row.stack,
      buildSystem: row.buildSystem,
      layout: row.layout,
    };
  }
  return {
    kind: 'new-project',
    stack: row.stack,
    ...(row.buildSystem === null ? {} : { buildSystem: row.buildSystem }),
    ...(row.moduleLayout === null ? {} : { moduleLayout: row.moduleLayout }),
    withPeerContext: row.peerContext,
    agentHarness: row.agentHarness,
  };
}

/** A row's cell as the paths golden keys it. */
export const factLine = (row: SingleFact | ProductFact): string =>
  newProjectCommandLine(factTarget(row));

/**
 * A settled `keel new` target's dial cell as the paths golden keys it:
 * the dials alone, since extras are not a dial. `target` is what
 * `keel.dials` settled, so every dial is set and a facet spelling is
 * already the preset's id.
 */
export function cellLine(target: NewProjectTarget): string {
  const { extraVerticals: _extras, services: _services, ...dials } = target;
  return newProjectCommandLine(dials);
}

/** Whether a settled target names extras, on the project or on any service. */
export function namesExtras(target: NewProjectTarget): boolean {
  return (
    (target.extraVerticals ?? []).length > 0 ||
    Object.values(target.services ?? {}).some((service) => service.extraVerticals.length > 0)
  );
}

/** What one e2e suite claims to scaffold. */
export interface SuiteClaims {
  /** `proves`: the suite is a row's; `seeds`: it has a role; `none`: it is neither. */
  readonly kind: 'proves' | 'seeds' | 'none';
  /** The cells, as the paths golden keys them. */
  readonly cells: ReadonlySet<string>;
}

/** The cells the e2e suite `suite` (its file's name less `.test.ts`) claims. */
export function claimsOf(suite: string): SuiteClaims {
  const rows = [...SHIPPED_SUPPORT_FACTS.singles, ...SHIPPED_SUPPORT_FACTS.products].filter(
    (row) => row.suite === suite,
  );
  if (rows.length > 0) return { kind: 'proves', cells: new Set(rows.map(factLine)) };
  const role = E2E_ROLES[suite];
  if (role !== undefined) return { kind: 'seeds', cells: new Set(role.seeds ?? []) };
  return { kind: 'none', cells: new Set() };
}

/** The `keel new` target a dispatched command asks `keel.dials` to settle, as the e2e job reads it. */
export function commandTarget(command: NewProjectCommand): NewProjectTarget {
  const { stack, layout, buildSystem, moduleLayout, withPeerContext } = command;
  const { extraVerticals, services, agentHarness } = command;
  return {
    kind: 'new-project',
    ...(stack === undefined ? {} : { stack }),
    ...(layout === undefined ? {} : { layout }),
    ...(buildSystem === undefined ? {} : { buildSystem }),
    ...(moduleLayout === undefined ? {} : { moduleLayout }),
    ...(withPeerContext === undefined ? {} : { withPeerContext }),
    ...(extraVerticals === undefined ? {} : { extraVerticals }),
    ...(services === undefined ? {} : { services }),
    ...(agentHarness === undefined ? {} : { agentHarness }),
  };
}
