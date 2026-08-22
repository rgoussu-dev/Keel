/**
 * The filesystem adapter behind `GET /api/browse` — the target
 * picker's "where should this project go?".
 *
 * Only directories are listed, and only names: the picker is
 * choosing a folder, and a file list would be noise on a source tree.
 * `empty` is what the greenfield half needs, since `keel new` refuses
 * a directory that already holds a keel project and a user pointing
 * at a populated folder usually meant a different one.
 *
 * A path that does not exist is not an error. Typing a directory that
 * has yet to be created is the normal way to start a project, so the
 * listing comes back `exists: false` with the parent still navigable,
 * and the install creates it.
 */

import path from 'node:path';
import os from 'node:os';
import { readdir, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import type { DirectoryEntry, DirectoryListing, DirectoryReader } from '../contract/api.js';

/** Reads real directories. */
export function fsDirectoryReader(defaultPath: string): DirectoryReader {
  return {
    defaultPath: () => defaultPath,
    async list(requested: string): Promise<DirectoryListing> {
      const target = path.resolve(expandHome(requested));
      const parent = path.dirname(target);
      const base: Omit<DirectoryListing, 'entries' | 'empty' | 'exists'> = {
        path: target,
        parent: parent === target ? null : parent,
      };
      try {
        const found = await readdir(target, { withFileTypes: true });
        return {
          ...base,
          entries: await directoriesOf(target, found),
          empty: found.length === 0,
          exists: true,
        };
      } catch {
        return { ...base, entries: [], empty: true, exists: false };
      }
    },
  };
}

/** The default the picker opens on: the CLI's cwd. */
export function currentDirectory(): string {
  return process.cwd();
}

async function directoriesOf(
  parent: string,
  found: readonly Dirent[],
): Promise<readonly DirectoryEntry[]> {
  const entries: DirectoryEntry[] = [];
  for (const item of found) {
    if (item.name.startsWith('.')) continue;
    if (!(await isDirectory(parent, item))) continue;
    entries.push({ name: item.name, path: path.join(parent, item.name) });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * `withFileTypes` reports a symlink as a symlink, not as what it
 * points at, so a symlinked directory would vanish from the picker.
 * One `stat` per link resolves it; a broken link stats badly and is
 * skipped, which is the right answer for something you cannot cd
 * into.
 */
async function isDirectory(parent: string, item: Dirent): Promise<boolean> {
  if (item.isDirectory()) return true;
  if (!item.isSymbolicLink()) return false;
  try {
    return (await stat(path.join(parent, item.name))).isDirectory();
  } catch {
    return false;
  }
}

/** Expands a leading `~` so a typed home path resolves. */
function expandHome(input: string): string {
  if (input === '~') return os.homedir();
  if (input.startsWith(`~${path.sep}`) || input.startsWith('~/')) {
    return path.join(os.homedir(), input.slice(2));
  }
  return input;
}
