/**
 * How the page reads an answer from its API.
 *
 * Same standing as `finder.test.ts` and `command.test.ts`: a pure
 * function living in `assets/web/` and tested here because it needs
 * no browser. `api.js` reads every body once, as text, and hands it
 * here with its status.
 *
 * The part with an answer that can be wrong is the failure branch.
 * The client used to parse the body as JSON before anything else, and
 * a body that was not JSON came back as "POST /api/preview failed
 * with 500" — the server had a sentence naming the fix on the wire
 * and the page showed a status number. Every case below is a body
 * shape the page must still be able to say something true about.
 */

import { describe, expect, it } from 'vitest';
import { errorFrom, INTERNAL, outcomeFrom } from '../../../assets/web/src/response.js';

const envelope = (code: string, message: string): string =>
  JSON.stringify({ error: { code, message } });

describe('errorFrom', () => {
  it('takes a refusal’s envelope as it stands', () => {
    const message = "unknown stack 'nope'; available: go-cli, ts-cli";
    expect(errorFrom(422, envelope('keel.unknown-stack', message))).toEqual({
      code: 'keel.unknown-stack',
      message,
    });
  });

  it('keeps the refusal a refusal carries as data, for the page to act on', () => {
    const refusal = {
      kind: 'elsewhere',
      vertical: 'persistence',
      services: [{ path: 'backend', stack: 'quarkus-rest', readiness: 'ready' }],
    };
    const message =
      'Persistence belongs to a service, not to the product root — it goes in backend/';
    const body = JSON.stringify({
      error: { code: 'keel.uncoverable-vertical', message, refusal },
    });
    expect(errorFrom(422, body)).toEqual({ code: 'keel.uncoverable-vertical', message, refusal });
  });

  it('labels an internal error as the bug it is, keeping its sentence', () => {
    const sentence = 'fullstack/product-compose: product manifest declares no services';
    const error = errorFrom(500, envelope(INTERNAL, sentence));
    expect(error.code).toBe('keel.internal');
    expect(error.message).toBe(
      `keel hit an internal error — this is a bug, please report it: ${sentence}`,
    );
  });

  it('keeps a plain-text body verbatim, under a code naming the status', () => {
    expect(errorFrom(413, 'request body too large')).toEqual({
      code: 'keel.web.http-413',
      message: 'request body too large',
    });
  });

  it('keeps a JSON body that is not the envelope verbatim too', () => {
    expect(errorFrom(502, '{"detail":"upstream gone"}')).toEqual({
      code: 'keel.web.http-502',
      message: '{"detail":"upstream gone"}',
    });
  });

  it('still says something when the body is empty', () => {
    const error = errorFrom(503, '');
    expect(error.code).toBe('keel.web.http-503');
    expect(error.message).toContain('503');
  });
});

describe('outcomeFrom', () => {
  it('hands a 2xx body back parsed', () => {
    expect(outcomeFrom(200, '{"stacks":[]}')).toEqual({ ok: true, value: { stacks: [] } });
  });

  it('turns anything else into the error errorFrom reads', () => {
    const body = envelope('keel.web.bad-request', 'body is not valid JSON');
    expect(outcomeFrom(400, body)).toEqual({ ok: false, error: errorFrom(400, body) });
  });
});
