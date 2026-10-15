/**
 * The stack table — the platform × entrypoint table keel's presets
 * are generated from, and the rule crossing its cells into products.
 *
 * `stack-presets.json` is keel's own data and nothing else's. A
 * plugin registers `Stack` objects (`contract/plugin.ts`), and a
 * preset document from outside this repository is a list of presets
 * (`StackPresetsSchema` in `./stacks.ts`), one record each. So the
 * table has a schema of its own, and its one job is to expand into
 * that preset document: `./stacks.ts` resolves what
 * {@link expandStackTable} returns exactly as it would a hand-written
 * one, so every check a preset passes — each reference registered, no
 * id twice — a generated one passes too.
 *
 * Nothing here imports `./stacks.ts`: it imports this module, and the
 * dependency rule refuses a cycle even through a type.
 */

import { z } from 'zod';

/** A word of an id: what an entrypoint set and `unsaid` are spelled in. */
const WordSchema = z.string().regex(/^[a-z0-9]+$/);

/** One entrypoint: the word a cell key names it by, and its tag. */
const EntrypointRowSchema = z
  .object({
    word: WordSchema,
    tag: z.string().min(1),
    projects: z.array(z.string().min(1)).nonempty().optional(),
  })
  .strict();

/** A vertical every cell installs, or one only a cell with entrypoint `with` does. */
const SingleVerticalSchema = z.union([
  z.string().min(1),
  z.object({ id: z.string().min(1), with: WordSchema }).strict(),
]);

/** One platform row: what its cells share, and the entrypoint sets it offers. */
const PlatformRowSchema = z
  .object({
    id: z.string().min(1),
    words: z.record(WordSchema, WordSchema).optional(),
    tags: z.array(z.string().min(1)),
    buildSystems: z.array(z.string().min(1)).nonempty().optional(),
    cells: z.record(z.string().min(1), z.string().min(1)),
  })
  .strict();

/** One service of a product rule, and the stacks it is chosen from. */
const ProductServiceSchema = z
  .object({
    path: z.string().min(1),
    stacks: z.array(z.string().min(1)).nonempty(),
    extraVerticals: z.array(z.string().min(1)).nonempty().optional(),
  })
  .strict();

/** A product rule: one product per choice of one stack for each service. */
const ProductRuleSchema = z
  .object({
    id: z.string().min(1),
    unsaid: z.array(WordSchema).optional(),
    description: z.string().min(1),
    verticals: z.array(z.string().min(1)),
    services: z.array(ProductServiceSchema).nonempty(),
  })
  .strict();

/**
 * The whole table, as `stack-presets.json` writes it, its header
 * (`"//"`) aside. An unknown key is refused at every level: a
 * misspelt one would otherwise be dropped, and its field expand as
 * absent.
 */
export const StackTableSchema = z
  .object({
    '//': z.array(z.string()).optional(),
    entrypoints: z.array(EntrypointRowSchema).nonempty(),
    singles: z
      .object({
        tags: z.array(z.string().min(1)),
        moduleLayouts: z.array(z.string().min(1)).nonempty(),
        verticals: z.array(SingleVerticalSchema),
      })
      .strict(),
    platforms: z.array(PlatformRowSchema).nonempty(),
    products: z.array(ProductRuleSchema),
  })
  .strict();

type StackTable = z.infer<typeof StackTableSchema>;
type PlatformRow = StackTable['platforms'][number];
type ProductRule = StackTable['products'][number];

/** One generated preset, in the wire shape `StackPresetsSchema` reads. */
export interface GeneratedPreset {
  readonly id: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly buildSystems?: readonly string[];
  readonly moduleLayouts?: readonly string[];
  readonly verticals: readonly string[];
  readonly projects?: readonly string[];
  readonly services?: readonly {
    readonly path: string;
    readonly stack: string;
    readonly extraVerticals?: readonly string[];
  }[];
}

/**
 * Validates a stack table and expands it into a preset document, its
 * presets in the registry's order: a platform's languages together
 * (rows whose tags other than `lang.*` are the same set), its
 * one-entrypoint cells before its composed ones, then the products,
 * rule by rule.
 *
 * A malformed table throws, naming the file and each issue's path —
 * a key the schema does not know among them, at every level. So does a
 * word the table does not define where an entrypoint is meant (a cell
 * key, a row's `words`, a vertical's `with`) or a cell key out of
 * table order; a row naming no platform (no tag but `lang.*`); a
 * product rule with two services at one path, a `{<path>}` none of
 * its services is at, or an id with an empty word; and a product
 * naming a stack that is no cell of the table, a product among them.
 * Each is a defect in keel's own file, never a piece a build lacks,
 * and each would otherwise expand quietly into the wrong presets. Two cells spelling one id are left to the resolver, which
 * reports a preset declared twice.
 */
export function expandStackTable(raw: unknown): { readonly presets: readonly GeneratedPreset[] } {
  const parsed = StackTableSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`stack-presets.json: ${issuesOf(parsed.error).join('; ')}`);
  const table = parsed.data;
  const order = table.entrypoints.map((entry) => entry.word);
  for (const vertical of table.singles.verticals) {
    if (typeof vertical !== 'string')
      entrypointWord(vertical.with, order, `vertical '${vertical.id}'`);
  }
  const platforms = table.platforms.map((row) => platformOf(row, order));
  const cells = table.platforms
    .flatMap((row, index) =>
      Object.entries(row.cells).map(([key, description]) => ({
        row,
        group: platforms.indexOf(platforms[index] ?? ''),
        words: entrypointWords(key, order),
        description,
      })),
    )
    .map((cell, position) => ({ ...cell, position }))
    .sort(
      (a, b) => a.group - b.group || a.words.length - b.words.length || a.position - b.position,
    );

  const singles = cells.map((cell) => singleOf(table, cell.row, cell.words, cell.description));
  const generated = new Set(singles.map((preset) => preset.id));
  const products = table.products.flatMap((rule) => {
    const paths = rule.services.map((service) => service.path);
    const twice = paths.find((path, at) => paths.indexOf(path) !== at);
    if (twice !== undefined) {
      throw new Error(`stack-presets.json: a product rule has two services at '${twice}'`);
    }
    return choicesOf(rule).map((chosen) => {
      for (const stack of Object.values(chosen)) {
        if (!generated.has(stack)) {
          throw new Error(
            `stack-presets.json: a product names '${stack}', which is no cell of the table`,
          );
        }
      }
      return productOf(rule, chosen);
    });
  });
  return { presets: [...singles, ...products] };
}

/** Each issue of a schema refusal at its path, a union's own alternatives' included. */
function issuesOf(error: z.ZodError): readonly string[] {
  return error.issues.flatMap((issue) =>
    issue.code === 'invalid_union'
      ? issue.unionErrors.flatMap(issuesOf)
      : [`${issue.path.join('.') || '(root)'}: ${issue.message}`],
  );
}

/** A cell key's entrypoint words, refusing any spelling of the set but one. */
function entrypointWords(key: string, order: readonly string[]): readonly string[] {
  const words = key.split('+');
  if (order.filter((word) => words.includes(word)).join('+') !== key) {
    throw new Error(
      `stack-presets.json: cell '${key}' is not entrypoint words joined by '+' in the order ${order.join(', ')}`,
    );
  }
  return words;
}

/** `word`, refused unless it names one of the table's entrypoints. */
function entrypointWord(word: string, order: readonly string[], where: string): string {
  if (!order.includes(word)) {
    throw new Error(
      `stack-presets.json: ${where} names '${word}', which is none of the entrypoints ${order.join(', ')}`,
    );
  }
  return word;
}

/**
 * The platform a row is on: its tags other than `lang.*`, as a set.
 * A row with none would group with every other such row, whatever its
 * language, so it is refused.
 */
function platformOf(row: PlatformRow, order: readonly string[]): string {
  for (const word of Object.keys(row.words ?? {})) {
    entrypointWord(word, order, `row '${row.id}'`);
  }
  const platform = row.tags.filter((tag) => !tag.startsWith('lang.')).sort();
  if (platform.length === 0) {
    throw new Error(`stack-presets.json: row '${row.id}' has no tag but its language's`);
  }
  return platform.join(' ');
}

function singleOf(
  table: StackTable,
  row: PlatformRow,
  words: readonly string[],
  description: string,
): GeneratedPreset {
  const entries = table.entrypoints.filter((entry) => words.includes(entry.word));
  const projects = entries.flatMap((entry) => entry.projects ?? []);
  return {
    id: row.id.replace('{entrypoints}', words.map((word) => row.words?.[word] ?? word).join('-')),
    description,
    tags: [...row.tags, ...table.singles.tags, ...entries.map((entry) => entry.tag)],
    ...(row.buildSystems ? { buildSystems: row.buildSystems } : {}),
    moduleLayouts: table.singles.moduleLayouts,
    verticals: table.singles.verticals.flatMap((vertical) =>
      typeof vertical === 'string'
        ? [vertical]
        : words.includes(vertical.with)
          ? [vertical.id]
          : [],
    ),
    ...(projects.length > 0 ? { projects } : {}),
  };
}

/** Every choice of one stack per service, the first service outermost. */
function choicesOf(rule: ProductRule): readonly Readonly<Record<string, string>>[] {
  return rule.services.reduce<readonly Readonly<Record<string, string>>[]>(
    (sofar, service) =>
      sofar.flatMap((chosen) =>
        service.stacks.map((stack) => ({ ...chosen, [service.path]: stack })),
      ),
    [{}],
  );
}

function productOf(rule: ProductRule, chosen: Readonly<Record<string, string>>): GeneratedPreset {
  const fill = (template: string): string =>
    template.replace(/\{([^}]+)\}/g, (_, path: string) => {
      const stack = Object.hasOwn(chosen, path) ? chosen[path] : undefined;
      if (stack === undefined) {
        throw new Error(
          `stack-presets.json: a product rule names '{${path}}', which is none of its services`,
        );
      }
      return stack;
    });
  const unsaid = new Set(rule.unsaid ?? []);
  const spelled = fill(rule.id);
  const words = spelled.split('-');
  if (words.includes('')) {
    throw new Error(`stack-presets.json: a product rule spells '${spelled}', a word of it empty`);
  }
  return {
    id: words.filter((word) => !unsaid.has(word)).join('-'),
    description: fill(rule.description),
    tags: [],
    verticals: rule.verticals,
    services: rule.services.map((service) => ({
      path: service.path,
      stack: chosen[service.path] ?? '',
      ...(service.extraVerticals ? { extraVerticals: service.extraVerticals } : {}),
    })),
  };
}
