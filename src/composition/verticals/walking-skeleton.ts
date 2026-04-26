/**
 * The `walking-skeleton` vertical — emits the thinnest end-to-end
 * runnable project for a given stack/arch combo.
 *
 * Today the vertical covers only the `entrypoint` dimension and ships
 * one adapter (`walking-skeleton/quarkus-cli-bootstrap`). The
 * dimensions list will grow as we add adapters for VCS bootstrap,
 * gradle wrapper, hexagonal layout, sample port + fake, scenario
 * test, IaC, and CI. Predicate-conditioned siblings will cover the
 * same dimensions for REST (`arch.server-http`) once that lands.
 */

import { quarkusCliBootstrapAdapter } from '../adapters/quarkus-cli-bootstrap.js';
import type { Vertical } from '../types.js';

export const walkingSkeletonVertical: Vertical = {
  id: 'walking-skeleton',
  description: 'Greenfield project skeleton with a runnable end-to-end slice.',
  dimensions: ['entrypoint'],
  adapters: [quarkusCliBootstrapAdapter],
};
