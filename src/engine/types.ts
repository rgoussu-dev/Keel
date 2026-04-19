/**
 * Public contract for the schematics engine. The interfaces here are the
 * **port**; a concrete implementation (e.g. the homegrown engine shipped
 * with keel) is the adapter. Swap the adapter to swap the engine without
 * changing any schematic code.
 */

import type { Logger } from '../util/log.js';

/**
 * A virtual filesystem staged in memory. Every schematic operates on a
 * Tree; the engine materialises the Tree to disk only after a dry-run has
 * been reviewed (or `commit` is called explicitly).
 */
export interface Tree {
  /** Returns the content of a file in the tree, or `null` if absent. */
  read(filePath: string): Buffer | null;
  /** Writes (or overwrites) a file in the tree. */
  write(filePath: string, content: Buffer | string): void;
  /** Deletes a file from the tree. No-op if absent. */
  delete(filePath: string): void;
  /** Reports whether the given file exists in the tree. */
  exists(filePath: string): boolean;
  /** Lists files under the given directory in the tree. */
  list(dirPath: string): readonly string[];
  /** Returns every file affected (created, modified, deleted) by staged actions. */
  changes(): readonly TreeChange[];
}

export type TreeChange =
  | { kind: 'create'; path: string }
  | { kind: 'modify'; path: string }
  | { kind: 'delete'; path: string };

/**
 * Execution context passed to a schematic's `run`. Provides logging,
 * interactive prompts, and the ability to invoke other registered
 * schematics (composition).
 */
export interface Context {
  readonly logger: Logger;
  /** Prompts the user for a value matching the schema. */
  prompt<T>(schema: PromptSchema<T>): Promise<T>;
  /** Invokes a registered schematic by name, sharing the current Tree. */
  invoke(schematicName: string, options: Options): Promise<void>;
  /** Current working directory the schematic should treat as project root. */
  readonly cwd: string;
}

export type Options = Readonly<Record<string, unknown>>;

/**
 * Declares an interactive prompt for a schematic parameter. The engine
 * uses this to render a CLI prompt (or, eventually, an IDE UI).
 */
export type PromptSchema<T> =
  | {
      kind: 'input';
      name: string;
      message: string;
      default?: string;
      validate?: (v: string) => true | string;
    }
  | {
      kind: 'select';
      name: string;
      message: string;
      choices: readonly { name: string; value: T }[];
    }
  | { kind: 'confirm'; name: string; message: string; default?: boolean };

/**
 * A single, composable code generator. The engine registers schematics by
 * name; schematics may invoke other schematics via `context.invoke`.
 */
export interface Schematic {
  readonly name: string;
  readonly description: string;
  readonly parameters: ParameterSpec[];
  /** Runs the generator against the given tree; mutations are staged. */
  run(tree: Tree, options: Options, context: Context): Promise<void>;
  /** Optional per-version migrations to run on `keel update`. */
  readonly migrations?: Migration[];
}

export interface ParameterSpec {
  name: string;
  description: string;
  required: boolean;
  prompt?: PromptSchema<unknown>;
}

export interface Migration {
  /** Semver tag of the kit version that introduced the migration. */
  version: string;
  /** Applies the migration to the given tree. */
  run(tree: Tree, context: Context): Promise<void>;
}

/**
 * The engine — a registry of schematics plus the ability to run one. This
 * is the top-level port; the concrete implementation is swappable.
 */
export interface Engine {
  register(schematic: Schematic): void;
  get(name: string): Schematic | null;
  names(): readonly string[];
  /**
   * Runs a registered schematic end-to-end: creates a tree, executes the
   * schematic, optionally prints a dry-run, and commits the tree to disk.
   */
  run(name: string, options: Options, context: Context, opts?: { dryRun?: boolean }): Promise<void>;
}
