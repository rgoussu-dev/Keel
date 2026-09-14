/**
 * The engine's merge of realized hooks into `.claude/settings.json` —
 * the key-addressed settings class of the harness contribution model.
 *
 * The file is the project's: permissions, env and the project's own
 * hooks stay exactly as they are. keel's part is one entry per
 * realized hook, addressed by the command it runs, so a reapply
 * finds each entry where it left it and adds only what is missing.
 * A hook the project lists under `env.KEEL_DISABLED_HOOKS` is left
 * unwired, and keel's entry for it removed. A merge that changes
 * nothing returns the file byte for byte, formatting included.
 */

import {
  DISABLED_HOOKS_ENV,
  SETTINGS_TARGET,
  hookCommand,
  type HookSpec,
} from '../contract/hook.js';

/**
 * `.claude/settings.json` as a project without one starts from — the
 * schema reference, nothing else. The hooks merged into it make the
 * rest.
 */
export const SETTINGS_SEED = `{
  "$schema": "https://json.schemastore.org/claude-code-settings.json"
}
`;

interface SettingsHook {
  type?: string;
  command?: string;
}

interface SettingsEntry {
  matcher?: string;
  hooks?: SettingsHook[];
}

interface Settings {
  hooks?: Record<string, unknown>;
  env?: Record<string, unknown>;
  [key: string]: unknown;
}

/** What the merge needs of a hook: its name, where it attaches, and the script its command runs. */
export type WiredHook = Pick<HookSpec, 'name' | 'event' | 'matcher' | 'script'>;

/**
 * Merges `hooks` into a settings file: an entry per hook whose command
 * no entry of its event runs yet, and none for a hook the file's
 * `env` disables — whose keel entry is removed instead. Refuses a
 * file that is not a JSON object, whose `hooks` is not an object or
 * whose event lists are not lists, naming the fix rather than
 * rewriting it into a shape Claude Code would not load.
 */
export function mergeHookSettings(existing: string, hooks: readonly WiredHook[]): string {
  const settings = parseSettings(existing);
  const current = settings.hooks === undefined ? {} : settings.hooks;
  if (current === null || typeof current !== 'object' || Array.isArray(current)) {
    throw new Error(`${SETTINGS_TARGET}: expected hooks to be an object. Fix the file and re-run.`);
  }
  const disabled = disabledHooks(settings);
  const merged: Record<string, unknown> = { ...current };
  let changed = false;
  for (const hook of hooks) {
    const listed = merged[hook.event] === undefined ? [] : merged[hook.event];
    if (!Array.isArray(listed)) {
      throw new Error(
        `${SETTINGS_TARGET}: expected hooks.${hook.event} to be a list. Fix the file and re-run.`,
      );
    }
    const entries = listed as SettingsEntry[];
    const command = hookCommand(hook);
    const runs = (entry: SettingsEntry) =>
      Array.isArray(entry.hooks) && entry.hooks.some((h) => h.command === command);
    if (disabled.has(hook.name)) {
      if (!entries.some(runs)) continue;
      const kept = entries
        .map((entry) =>
          runs(entry)
            ? { ...entry, hooks: entry.hooks!.filter((h) => h.command !== command) }
            : entry,
        )
        .filter((entry) => !Array.isArray(entry.hooks) || entry.hooks.length > 0);
      if (kept.length === 0) delete merged[hook.event];
      else merged[hook.event] = kept;
      changed = true;
      continue;
    }
    if (entries.some(runs)) continue;
    merged[hook.event] = [
      ...entries,
      {
        ...(hook.matcher === undefined ? {} : { matcher: hook.matcher }),
        hooks: [{ type: 'command', command }],
      },
    ];
    changed = true;
  }
  if (!changed) return existing;
  return `${JSON.stringify({ ...settings, hooks: merged }, null, 2)}\n`;
}

function parseSettings(existing: string): Settings {
  let settings: unknown;
  try {
    settings = JSON.parse(existing);
  } catch (err) {
    throw new Error(
      `${SETTINGS_TARGET}: not valid JSON (${err instanceof Error ? err.message : String(err)}). Fix the file (or delete it) and re-run.`,
    );
  }
  if (settings === null || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error(
      `${SETTINGS_TARGET}: expected a JSON object at the top level. Fix the file and re-run.`,
    );
  }
  return settings as Settings;
}

/** The hook names the settings' `env` turns off, from its {@link DISABLED_HOOKS_ENV} list. */
function disabledHooks(settings: Settings): ReadonlySet<string> {
  const env = settings.env;
  const listed = env !== null && typeof env === 'object' ? env[DISABLED_HOOKS_ENV] : undefined;
  if (typeof listed !== 'string') return new Set();
  return new Set(
    listed
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name.length > 0),
  );
}
