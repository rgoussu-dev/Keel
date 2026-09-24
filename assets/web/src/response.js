/**
 * What an answer from the local API means, given its status and its
 * body.
 *
 * The body is read **once, as text**, and interpreted here. A response
 * body is a stream: the client used to try `response.json()` first,
 * and once that had consumed it there was nothing left for a fallback
 * to read — so a 500 whose body was a plain sentence reached the page
 * as "POST /api/preview failed with 500", dropping a message that
 * often named the fix. Taking the text first and parsing it second
 * means every body can be shown, whatever shape it arrived in.
 *
 * Pure, and separate from `api.js` — which claims the token out of
 * `location` the moment it loads — so it is testable without a DOM,
 * the same split `finder.js` and `steps.js` live under.
 *
 * @typedef {{ code: string, message: string, refusal?: object }} ApiError
 *   `refusal` is the engine's structured refusal, when it raised one as
 *   data — a vertical this project cannot carry, a file in the way —
 *   beside the sentence written from it.
 * @typedef {{ ok: true, value: unknown } | { ok: false, error: ApiError }} Outcome
 */

/**
 * The code the server answers a throw nothing turned into a refusal
 * with. A refusal carries a code of its own and comes back as a 422;
 * this one is a bug by definition, and the page says so.
 */
export const INTERNAL = 'keel.internal';

/**
 * The outcome of a call: its parsed value on a 2xx, its error
 * otherwise. A 2xx body that is not JSON yields a null value, as it
 * always has — the server sends none, and a caller branching on
 * `ok` should not be handed a parse failure dressed as a refusal.
 *
 * @param {number} status the HTTP status
 * @param {string} bodyText the whole body, read once as text
 * @returns {Outcome}
 */
export function outcomeFrom(status, bodyText) {
  if (status >= 200 && status < 300) return { ok: true, value: parsed(bodyText) };
  return { ok: false, error: errorFrom(status, bodyText) };
}

/**
 * The error a failed call carries.
 *
 * The server's envelope — `{ "error": { "code", "message" } }`, with
 * a `refusal` beside them when the engine raised one as data — is
 * taken as it stands, except that {@link INTERNAL} is labelled as the
 * bug it is. Any other body is kept verbatim under a code naming the
 * status: a sentence the page did not expect is still a better
 * message than the status number it would otherwise fall back to.
 *
 * @param {number} status the HTTP status
 * @param {string} bodyText the whole body, read once as text
 * @returns {ApiError}
 */
export function errorFrom(status, bodyText) {
  const envelope = parsed(bodyText)?.error;
  if (isApiError(envelope)) {
    if (envelope.code !== INTERNAL) return envelope;
    return {
      code: INTERNAL,
      message: `keel hit an internal error — this is a bug, please report it: ${envelope.message}`,
    };
  }
  return {
    code: `keel.web.http-${status}`,
    message:
      bodyText.trim() === '' ? `the keel server answered ${status} with an empty body` : bodyText,
  };
}

/**
 * What a failed call amounts to, in the words the plan column heads it
 * with and the review step leads its reason with — so a bug never
 * reads as a refusal, nor a refusal as a bug.
 *
 * Three kinds, because the user's next move differs for each:
 *
 *   - **a refusal** — the engine understood the run and will not do
 *     it, and its sentence says what would change that: change a
 *     choice;
 *   - **a bug** ({@link INTERNAL}) — the engine threw where it should
 *     have refused or done the work: nothing on the page is wrong, and
 *     the thing to do is report it;
 *   - **no answer** — the run never reached the engine
 *     (`keel.web.*`): the server is gone, answered in a shape the
 *     page did not expect, or turned the request away before reading
 *     it — as it does every call from a page reloaded without the
 *     token its URL carried. Keel said nothing about the run, so the
 *     title does not say it did.
 *
 * @param {ApiError} error
 * @returns {{ kind: 'refusal' | 'bug' | 'no-answer', title: string, lead: string }}
 */
export function failureOf(error) {
  if (error.code === INTERNAL) {
    return {
      kind: 'bug',
      title: 'No plan — keel hit a bug, not a refusal',
      lead: 'A bug, not a refusal:',
    };
  }
  if (error.code.startsWith('keel.web.')) {
    return {
      kind: 'no-answer',
      title: 'No plan — keel gave no answer on this run',
      lead: 'No answer on this run:',
    };
  }
  return {
    kind: 'refusal',
    title: 'No plan — keel refuses this run as it stands',
    lead: 'Refused:',
  };
}

function parsed(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isApiError(value) {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof value.code === 'string' &&
    typeof value.message === 'string'
  );
}
