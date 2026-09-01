/**
 * Billing posture for agent subprocess environments.
 *
 * Headless ≠ API billing: `claude -p` uses whatever auth the CLI
 * holds, and subscription OAuth works headlessly — but a stray
 * `ANTHROPIC_API_KEY` in the operator's shell outranks it and
 * silently turns a subscription campaign into a metered one. So the
 * rig strips the key (and its auth-token sibling) from every agent
 * environment by default; `KEEL_EVALS_API_BILLING=1` is the explicit
 * opt-in that keeps them.
 */

const BILLING_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];

/**
 * The environment an agent subprocess gets: the operator's, minus
 * API-billing credentials unless explicitly opted in, plus overrides.
 */
export function agentEnv(base = process.env, overrides = {}) {
  const env = { ...base, ...overrides };
  if (env['KEEL_EVALS_API_BILLING'] !== '1') {
    for (const name of BILLING_VARS) delete env[name];
  }
  return env;
}
