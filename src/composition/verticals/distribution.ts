/**
 * The `distribution` vertical — answers "how does this project ship?"
 *
 * The first non-skeleton vertical. Brownfield-installable via
 * `keel add distribution` once the composition CLI's add command
 * lands; greenfield-composable by listing it in a stack preset.
 *
 * Today only the `quarkus-cli-native` adapter ships under it; future
 * adapters (e.g. JVM uberjar, Docker image, Homebrew formula) will
 * cover the same `build` / `release-channel` dimensions and be
 * selected by predicate.
 */

import { quarkusCliNativeAdapter } from '../adapters/quarkus-cli-native.js';
import type { Vertical } from '../../domain/contract/composition.js';

export const distributionVertical: Vertical = {
  id: 'distribution',
  description: 'How this project ships.',
  dimensions: ['build', 'release-channel'],
  adapters: [quarkusCliNativeAdapter],
};
