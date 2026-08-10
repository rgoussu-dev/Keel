/**
 * `gateway/rest-api-contract` adapter — pins the REST seam's wire
 * contract as an OpenAPI document owned by the backend
 * (`contract/greet.openapi.yaml`). Fires for any HTTP backend with an
 * SPA peer, whatever its language: the document describes the wire,
 * not the framework — `GET /greet`, optional `name` defaulting to
 * "world", `{"greeting": …}` on 200, RFC 9457 problem documents on
 * errors.
 *
 * The contract is the frontend gateway's reference: its fake and the
 * real adapter both encode this shape, and integration tests against
 * a running backend (see the fullstack e2e suites) verify it stays
 * true.
 */

import type { Adapter } from '../../contract/composition.js';

export const REST_API_CONTRACT_ID = 'gateway/rest-api-contract';

const TEMPLATE_ID = 'composition/gateway/rest-api-contract/templates';

export const restApiContractAdapter: Adapter = {
  id: REST_API_CONTRACT_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['arch.server-http', 'peer.ui.spa'] },
  async contribute(ctx) {
    const files = await ctx.templates.render(TEMPLATE_ID, '', {});
    return { files };
  },
};
