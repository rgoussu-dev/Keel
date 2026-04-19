import type { Engine } from '../engine/types.js';
import { HomegrownEngine } from '../engine/homegrown.js';
import { ciGithubSchematic } from './ci-github/factory.js';
import { executableRestSchematic } from './executable-rest/factory.js';
import { gitInitSchematic } from './git-init/factory.js';
import { gradleWrapperSchematic } from './gradle-wrapper/factory.js';
import { iacCloudrunSchematic } from './iac-cloudrun/factory.js';
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
  engine.register(ciGithubSchematic);
  engine.register(executableRestSchematic);
  engine.register(gitInitSchematic);
  engine.register(gradleWrapperSchematic);
  engine.register(iacCloudrunSchematic);
  engine.register(portSchematic);
  engine.register(scenarioSchematic);
  engine.register(walkingSkeletonSchematic);
  return engine;
}
