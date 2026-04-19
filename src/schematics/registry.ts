import type { Engine } from '../engine/types.js';
import { HomegrownEngine } from '../engine/homegrown.js';
import { portSchematic } from './port/factory.js';
import { scenarioSchematic } from './scenario/factory.js';
import { walkingSkeletonSchematic } from './walking-skeleton/factory.js';

/**
 * Builds the default engine with every shipped schematic registered. The
 * function returns the `Engine` port so callers remain decoupled from the
 * concrete engine implementation.
 */
export function buildEngine(): Engine {
  const engine = new HomegrownEngine();
  engine.register(portSchematic);
  engine.register(scenarioSchematic);
  engine.register(walkingSkeletonSchematic);
  return engine;
}
