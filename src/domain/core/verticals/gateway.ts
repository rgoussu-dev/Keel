/**
 * The `gateway` vertical — the service-to-service seam. Its adapters
 * are selected purely by peer tags (`peer.api.rest`, `peer.ui.spa`),
 * so the vertical declares no dimensions: with no peers in scope it
 * installs nothing, and with peers each side gets its half of the
 * seam — the frontend a REST gateway package, the backend a CORS
 * accommodation.
 *
 * Installed automatically for every service of a composite stack;
 * brownfield, run `keel link <peer>` in both projects and then
 * `keel add gateway` in each.
 */

import { goCorsAdapter } from '../adapters/go-cors.js';
import { micronautCorsAdapter } from '../adapters/micronaut-cors.js';
import { quarkusCorsAdapter } from '../adapters/quarkus-cors.js';
import { restApiContractAdapter } from '../adapters/rest-api-contract.js';
import { rustCorsAdapter } from '../adapters/rust-cors.js';
import { tsCorsAdapter } from '../adapters/ts-cors.js';
import { springCorsAdapter } from '../adapters/spring-cors.js';
import { springCorsKotlinAdapter } from '../adapters/spring-cors-kotlin.js';
import { wcGatewayRestAdapter } from '../adapters/wc-gateway-rest.js';
import type { Vertical } from '../../contract/composition.js';

export const gatewayVertical: Vertical = {
  id: 'gateway',
  title: 'Service gateway',
  description: 'Cross-service seam: client gateways and server accommodations from peer tags.',
  dimensions: [],
  adapters: [
    wcGatewayRestAdapter,
    quarkusCorsAdapter,
    springCorsAdapter,
    springCorsKotlinAdapter,
    micronautCorsAdapter,
    goCorsAdapter,
    rustCorsAdapter,
    tsCorsAdapter,
    restApiContractAdapter,
  ],
};
