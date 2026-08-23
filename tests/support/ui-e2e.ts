/**
 * The shared harness for the `keel ui` browser suites: resolving a
 * browser Playwright will accept, spawning the real `keel ui` and
 * reading the URL it prints, and driving a page that rebuilds itself
 * on every change.
 *
 * Lifted out of `tests/e2e/ui-stack-finder.test.ts` when a second
 * suite needed it — one that opens the page in a directory holding a
 * keel *plugin*, to see a stack keel never shipped rendered by a page
 * that knows nothing about plugins. Two suites spawning the same
 * process and fighting the same re-render should agree about how, and
 * the JVM and web e2e harnesses set that precedent.
 *
 * Nothing here asserts. Each suite owns its own `describe`, its own
 * `keel ui`, and its own temp directory — which is the whole reason
 * there are two: they differ by what is on disk when the page opens.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { type Locator, type Page } from 'playwright';
import { chromium } from './web-e2e.js';

/** The repository root, from this file's own location. */
export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where the greenfield form lives; every selector is scoped to it. */
export const FORM = 'keel-new-form';

/** Long enough for a cold `tsc` plus a browser launch, short of a hang. */
export const SETTLE_MS = 20_000;

/**
 * How long the page must go without touching the network before it
 * counts as settled. Comfortably above `<keel-app>`'s 120 ms preview
 * debounce, so a change that has not yet fired its request cannot be
 * mistaken for one that has already finished.
 */
const QUIET_MS = 400;

/**
 * The probed browser as an **absolute** path, or null.
 *
 * The shared probe answers with a bare command name when it finds one
 * on PATH — `google-chrome` on a GitHub-hosted runner, where no
 * Playwright download layout exists. That is enough for the other
 * browser-driven suites, which hand it to `spawn` and let PATH
 * resolution do the rest; Playwright instead stats `executablePath`
 * against the working directory and refuses a name it cannot find
 * there. Resolving here rather than widening the probe keeps the two
 * consumers honest about what each of them needs.
 */
export const browserBinary = ((): string | null => {
  if (chromium === null || path.isAbsolute(chromium)) return chromium;
  const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', [chromium], {
    encoding: 'utf8',
  });
  return found.status === 0 ? (found.stdout.split('\n')[0]?.trim() ?? null) : null;
})();

/* ---- the server under test ------------------------------------- */

/** A running `keel ui`, and how to stop it. */
export interface UiProcess {
  /** The address the CLI printed, token and all. */
  readonly url: string;
  stop(): Promise<void>;
}

/**
 * Spawns `keel ui --port 0` in `cwd` and waits for the URL it prints.
 *
 * The regex reads the token out of the line rather than the line's
 * wording: `keel ui: serving on …` is a log message, not a contract,
 * where `?token=` is the thing the page actually depends on.
 */
export async function startUi(cwd: string): Promise<UiProcess> {
  const child: ChildProcess = spawn(
    process.execPath,
    [path.join(repoRoot, 'bin', 'keel.js'), 'ui', '--port', '0', '--host', '127.0.0.1'],
    {
      cwd,
      // Chalk would otherwise wrap the URL in escape sequences on a
      // runner that sets FORCE_COLOR for its own output.
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
  let exited: number | null = null;
  child.once('exit', (code) => (exited = code));

  const stop = (): Promise<void> =>
    new Promise<void>((resolve) => {
      if (exited !== null || child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill();
    });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const found = /http:\/\/\S+\?token=[A-Za-z0-9_-]+/.exec(output);
    if (found) return { url: found[0], stop };
    if (exited !== null) {
      throw new Error(`keel ui exited before printing a URL (code ${exited})\n${output}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await stop();
  throw new Error(`keel ui never printed a URL\n${output}`);
}

/* ---- driving the page ------------------------------------------ */

/**
 * Waits for `check` to hold, polling rather than sleeping.
 *
 * Every wait here is over a control the form re-creates on each
 * render, so a locator resolved once is stale by the next frame —
 * re-resolving on every poll is what makes these assertions about
 * the rendered state rather than about a node that used to exist.
 */
export async function until(check: () => Promise<boolean>, what: string): Promise<void> {
  const deadline = Date.now() + SETTLE_MS;
  for (;;) {
    if (await check()) return;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Counts the page's requests, so an interaction can wait for quiet. */
export interface Traffic {
  /** Marks now as activity, so the quiet window restarts. */
  touch(): void;
  /** Whether nothing is in flight and nothing has happened recently. */
  quiet(): boolean;
}

export function watchTraffic(page: Page): Traffic {
  let inFlight = 0;
  let lastAt = Date.now();
  const mark = (delta: number): void => {
    inFlight += delta;
    lastAt = Date.now();
  };
  page.on('request', () => mark(1));
  page.on('requestfinished', () => mark(-1));
  page.on('requestfailed', () => mark(-1));
  return {
    touch: () => (lastAt = Date.now()),
    quiet: () => inFlight === 0 && Date.now() - lastAt > QUIET_MS,
  };
}

/**
 * Performs an interaction and waits for the preview loop to go quiet.
 *
 * `<keel-app>` answers a change twice — synchronously, then again
 * when the debounced preview returns — and the second render replaces
 * the form element. Acting on a control in the window between the two
 * would dispatch its `target-changed` from a node that is about to be
 * detached, and a detached node's event never reaches the app. So
 * every interaction is followed by a quiet window rather than by an
 * assertion alone.
 */
export async function act(traffic: Traffic, interaction: () => Promise<unknown>): Promise<void> {
  await interaction();
  traffic.touch();
  await until(() => Promise.resolve(traffic.quiet()), 'the preview loop to go quiet');
}

/**
 * A control of the greenfield form, by the id its facet carries.
 *
 * Not always a `<select>`: the entrypoint facet is a checkbox group
 * whose `id` sits on the caption, which is exactly what makes
 * {@link rendered} the right way to ask whether a facet is on the
 * page at all.
 */
export const control = (page: Page, id: string): Locator => page.locator(`${FORM} #${id}`);

/** An entrypoint checkbox, by the adapter id it carries. */
export const adapter = (page: Page, id: string): Locator =>
  page.locator(`${FORM} input[type="checkbox"][value="${id}"]`);

/** The value of a `<select>`, or null when the form does not render it. */
export async function valueOf(page: Page, id: string): Promise<string | null> {
  try {
    const found = control(page, id);
    return (await found.count()) === 0 ? null : await found.inputValue({ timeout: 1_000 });
  } catch {
    // Replaced between the count and the read; the caller retries.
    return null;
  }
}

/** Waits until the form reports `stack` as the chosen preset. */
export const stackIs = (page: Page, stack: string): Promise<void> =>
  until(async () => (await valueOf(page, 'stack')) === stack, `the stack to become ${stack}`);

/**
 * Whether a facet is on the page at all. The narrowing controls drop
 * out where they have nothing to ask, so absence is an assertion.
 */
export const rendered = async (page: Page, id: string): Promise<boolean> =>
  (await control(page, id).count()) > 0;
