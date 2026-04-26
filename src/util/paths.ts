import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * Resolves absolute paths used throughout the installer: a project's local
 * claude directory and the packaged assets shipped with this CLI.
 *
 * keel installs are scoped to the **project** only — the user's home
 * directory (`~/.claude`) is never read, written, or otherwise touched.
 */
export interface Paths {
  /** Project claude directory, e.g. `<cwd>/.claude`. */
  project(cwd: string): string;
  /** Absolute path to a packaged asset root. */
  asset(kind: AssetKind): string;
  /**
   * Absolute path to the `claude-core` schematic's template directory —
   * the source of the universal Claude scaffold rendered into a
   * project's `.claude/`. Stable seam used by `install`/`update` and
   * mocked in tests.
   */
  claudeCoreTemplates(): string;
}

export type AssetKind = 'schematics';

const __filename = fileURLToPath(import.meta.url);
const packageRoot = path.resolve(path.dirname(__filename), '..', '..');

export const paths: Paths = {
  project: (cwd) => path.join(cwd, '.claude'),
  asset: (kind) => path.join(packageRoot, 'assets', kind),
  claudeCoreTemplates: () =>
    path.join(packageRoot, 'assets', 'schematics', 'claude-core', 'templates'),
};
