/**
 * The JSON API of `keel ui` — the web equivalent of
 * `application/cli/contract`: it maps a request to a concrete
 * command or query from `domain/contract`, dispatches it through the
 * Mediator, and maps the `Result` back to a response. Zero business
 * logic, and no imports from `domain/core` or `infrastructure` — the
 * same rule the CLI adapter lives under, enforced by
 * `.dependency-cruiser.cjs`.
 *
 * Five routes, and the shape of them follows from what a form needs
 * that a terminal does not:
 *
 * | Route               | Dispatches            |
 * | ------------------- | --------------------- |
 * | `GET  /api/catalog` | `keel.catalog`        |
 * | `GET  /api/project` | `keel.project-status` |
 * | `POST /api/preview` | `keel.preview`        |
 * | `POST /api/install` | the install command   |
 * | `GET  /api/browse`  | the directory reader  |
 *
 * `preview` and `install` take the *same* body: one
 * {@link InstallTarget}, one answer map, one directory. That is the
 * point of the target type — the page previews with a body, the user
 * changes something, it previews again, and when they commit it
 * posts the identical body to the other route. Nothing is
 * re-derived, so nothing can disagree.
 *
 * Every request body is parsed through zod before it becomes a
 * command. The client is a page this server shipped, but it is still
 * a client: a malformed body must be a 400 naming the field, not a
 * `TypeError` thrown from inside a handler.
 */

import { z } from 'zod';
import type { Mediator } from '../../../domain/kernel/mediator.js';
import type { Result } from '../../../domain/kernel/result.js';
import {
  installCommandFor,
  type InstallTarget,
  type PresetAnswers,
} from '../../../domain/contract/commands.js';
import {
  catalogQuery,
  previewQuery,
  projectStatusQuery,
} from '../../../domain/contract/queries.js';
import { failure, json, type UiHandler, type UiRequest, type UiResponse } from './http.js';

/** Error code for a request this API could not make sense of. */
export const BAD_REQUEST = 'keel.web.bad-request';

/** One directory as the target picker renders it. */
export interface DirectoryListing {
  /** Absolute path of the directory listed. */
  readonly path: string;
  /** Absolute path of the parent, or null at a filesystem root. */
  readonly parent: string | null;
  /** Immediate subdirectories, name-sorted; files are not listed. */
  readonly entries: readonly DirectoryEntry[];
  /** Whether the directory holds no entries at all (files included). */
  readonly empty: boolean;
  /** False when the path does not exist or is not a directory. */
  readonly exists: boolean;
}

/** One subdirectory of a {@link DirectoryListing}. */
export interface DirectoryEntry {
  readonly name: string;
  readonly path: string;
}

/**
 * Directory listing for the target picker.
 *
 * Deliberately not a domain port: no command needs it, and keel's
 * hexagon has no business knowing that somebody is browsing for a
 * folder. It is a convenience of this transport, so it is declared
 * here and implemented in this adapter's executable.
 */
export interface DirectoryReader {
  list(path: string): Promise<DirectoryListing>;
  /** Where the picker opens when the client names no path. */
  defaultPath(): string;
}

/** What the composition root wires into the API. */
export interface ApiDeps {
  readonly mediator: Mediator;
  readonly directories: DirectoryReader;
}

const answersSchema: z.ZodType<PresetAnswers> = z.record(z.record(z.string()));

const targetSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('new-project'),
    stack: z.string().min(1).optional(),
    layout: z.enum(['monorepo', 'polyrepo']).optional(),
    buildSystem: z.string().min(1).optional(),
    moduleLayout: z.string().min(1).optional(),
    withPeerContext: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('add-vertical'),
    vertical: z.string().min(1),
    reapply: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('add-module'),
    module: z.string().min(1),
    consumes: z.string().min(1).optional(),
  }),
]);

const installBodySchema = z.object({
  cwd: z.string().min(1),
  target: targetSchema,
  answers: answersSchema.default({}),
});

/** Builds the API handler over the wired mediator. */
export function buildApi(deps: ApiDeps): UiHandler {
  return async (request: UiRequest): Promise<UiResponse | null> => {
    if (request.path !== '/api' && !request.path.startsWith('/api/')) return null;

    const route = `${request.method} ${request.path}`;
    switch (route) {
      case 'GET /api/catalog':
        return unwrap(await deps.mediator.dispatch(catalogQuery()));
      case 'GET /api/project':
        return project(deps, request);
      case 'GET /api/browse':
        return browse(deps, request);
      case 'POST /api/preview':
        return preview(deps, request);
      case 'POST /api/install':
        return install(deps, request);
      default:
        return failure(404, 'keel.web.unknown-route', `no route for ${route}`);
    }
  };
}

async function project(deps: ApiDeps, request: UiRequest): Promise<UiResponse> {
  const cwd = request.query['path'];
  if (cwd === undefined || cwd === '') {
    return failure(400, BAD_REQUEST, "GET /api/project needs a 'path' query parameter");
  }
  return unwrap(await deps.mediator.dispatch(projectStatusQuery({ cwd })));
}

async function browse(deps: ApiDeps, request: UiRequest): Promise<UiResponse> {
  const requested = request.query['path'];
  const target =
    requested === undefined || requested === '' ? deps.directories.defaultPath() : requested;
  return json(await deps.directories.list(target));
}

async function preview(deps: ApiDeps, request: UiRequest): Promise<UiResponse> {
  const body = parse(request);
  if (!body.ok) return body.response;
  const { cwd, target, answers } = body.value;
  return unwrap(await deps.mediator.dispatch(previewQuery({ cwd, target, answers })));
}

async function install(deps: ApiDeps, request: UiRequest): Promise<UiResponse> {
  const body = parse(request);
  if (!body.ok) return body.response;
  const { cwd, target, answers } = body.value;
  // Non-interactive on purpose: every answer the form gathered is in
  // `answers`, and a prompt reaching a terminal nobody is watching
  // would hang the request forever.
  const command = installCommandFor(target, { cwd, answers, interactive: false, dryRun: false });
  return unwrap(await deps.mediator.dispatch(command));
}

/** The install body, with the target already narrowed. */
interface InstallBody {
  readonly cwd: string;
  readonly target: InstallTarget;
  readonly answers: PresetAnswers;
}

type ParsedBody =
  | { readonly ok: true; readonly value: InstallBody }
  | { readonly ok: false; readonly response: UiResponse };

function parse(request: UiRequest): ParsedBody {
  let raw: unknown;
  try {
    raw = JSON.parse(request.body === '' ? '{}' : request.body);
  } catch {
    return { ok: false, response: failure(400, BAD_REQUEST, 'body is not valid JSON') };
  }
  const parsed = installBodySchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: failure(400, BAD_REQUEST, describe(parsed.error)) };
  }
  const { cwd, answers, target } = parsed.data;
  return { ok: true, value: { cwd, answers, target: narrow(target) } };
}

/**
 * Drops the keys zod left as `undefined`.
 *
 * `exactOptionalPropertyTypes` is on, so `{ layout: undefined }` and
 * `{}` are different types here — and only the second is a legal
 * {@link InstallTarget}. The distinction is not pedantry: an absent
 * `layout` means "ask, or default", where a present-but-undefined one
 * would have to be given a meaning nobody wants.
 */
function narrow(target: z.infer<typeof targetSchema>): InstallTarget {
  switch (target.kind) {
    case 'new-project':
      return {
        kind: 'new-project',
        ...(target.stack === undefined ? {} : { stack: target.stack }),
        ...(target.layout === undefined ? {} : { layout: target.layout }),
        ...(target.buildSystem === undefined ? {} : { buildSystem: target.buildSystem }),
        ...(target.moduleLayout === undefined ? {} : { moduleLayout: target.moduleLayout }),
        ...(target.withPeerContext === undefined
          ? {}
          : { withPeerContext: target.withPeerContext }),
      };
    case 'add-vertical':
      return {
        kind: 'add-vertical',
        vertical: target.vertical,
        ...(target.reapply === undefined ? {} : { reapply: target.reapply }),
      };
    case 'add-module':
      return {
        kind: 'add-module',
        module: target.module,
        ...(target.consumes === undefined ? {} : { consumes: target.consumes }),
      };
  }
}

function describe(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
}

/**
 * Maps a domain `Result` to this transport's shape: the value as
 * JSON, or 422 carrying the error's stable code and its message.
 *
 * 422 rather than 400 because these are not malformed requests. "the
 * project is already initialised", "that vertical is installed",
 * "this stack ships one module layout" — the request was understood
 * exactly, and refused on its merits. The client shows the message;
 * the code is what it branches on.
 */
function unwrap<T>(result: Result<T>): UiResponse {
  return result.ok ? json(result.value) : failure(422, result.error.code, result.error.message);
}
