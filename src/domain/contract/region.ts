/**
 * The **owned-region contract** — how a composition adapter owns one
 * sentinel-delimited section of a file several parties write.
 *
 * A {@link Region} is a pair of marker lines. An adapter that patches
 * a shared document — the stack section of `AGENTS.md`, the format
 * step of the pre-commit hook, its block of `.editorconfig` or of a
 * GitLab pipeline — **declares** the region on its
 * `ContributionPatch.regions`, and the engine holds it to that
 * declaration three ways: the transform may change nothing outside
 * its regions (a patch that escapes is refused naming the adapter),
 * exactly one adapter of a run may own each region of a target (a
 * second claim is refused naming both), and `--reapply` may
 * re-render what lies inside. Declaring is not trusting: the engine
 * verifies the claim on every apply, which is what makes the region
 * an ownership boundary rather than a comment.
 *
 * {@link upsertRegion} is the one section-replacing transform, so the
 * families, the verticals and a plugin cannot drift into as many
 * slightly different sentinel idioms; {@link regionPatch} wraps it
 * into a patch with the region declared, composable with a `seed` so
 * independent contributors compose one shared file order-free.
 *
 * Lives in its own leaf module — no import from the composition
 * contract — so that contract can name {@link Region} on a patch
 * without a cycle.
 */

/** A sentinel pair: the marker line that opens a region and the one that closes it. */
export interface Region {
  readonly begin: string;
  readonly end: string;
}

/**
 * Markers of the shape every keel-owned region uses — `keel:<owner>`
 * between the comment delimiters of the file's syntax — so an owner
 * reads the same in `AGENTS.md`, a shell hook, an ini file.
 */
export function markdownRegion(owner: string): Region {
  return { begin: `<!-- keel:${owner}:begin -->`, end: `<!-- keel:${owner}:end -->` };
}

/** {@link markdownRegion} for `#`-commented syntaxes: shell, YAML, ini, TOML. */
export function hashRegion(owner: string): Region {
  return { begin: `# keel:${owner}:begin`, end: `# keel:${owner}:end` };
}

/**
 * Refuses a region a plugin's `contribute()` could hand over in any
 * shape: both markers non-empty strings, and distinct, or the region
 * could never be located. Returns the region for chaining.
 */
export function assertRegion(region: unknown, where: string): Region {
  const r = region as Partial<Region> | null | undefined;
  if (
    r === null ||
    typeof r !== 'object' ||
    typeof r.begin !== 'string' ||
    typeof r.end !== 'string' ||
    r.begin.trim() === '' ||
    r.end.trim() === ''
  ) {
    throw new Error(`${where}: a region needs a non-empty 'begin' and 'end' marker`);
  }
  if (r.begin === r.end) {
    throw new Error(`${where}: a region's 'begin' and 'end' markers must differ ('${r.begin}')`);
  }
  return { begin: r.begin, end: r.end };
}

/** Where a region sits in a text: the marker offsets, or `null` when neither marker is present. */
export interface RegionSpan {
  /** Offset of the opening marker. */
  readonly begin: number;
  /** Offset one past the closing marker. */
  readonly end: number;
}

/**
 * Locates a region: `null` when the text carries neither marker, the
 * span when it carries both in order. One marker without the other,
 * or the pair reversed, means it was hand-edited apart — that throws
 * with the fix rather than guessing where the user's text ends.
 * `where` names the file (or the owner) in the message.
 */
export function locateRegion(text: string, region: Region, where: string): RegionSpan | null {
  const begin = text.indexOf(region.begin);
  const end = text.indexOf(region.end);
  if (begin === -1 && end === -1) return null;
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      `${where}: the sentinels are broken — expected '${region.begin}' followed by '${region.end}'. Restore the pair (or delete both) and re-run.`,
    );
  }
  return { begin, end: end + region.end.length };
}

/** How {@link upsertRegion} lays a body out and where a fresh region lands. */
export interface UpsertRegionOptions {
  /**
   * `blank` separates the body from its markers with a blank line —
   * the Markdown shape; `tight` (the default) puts the body right
   * between them — the shape of a shell step or an ini block.
   */
  readonly padding?: 'blank' | 'tight';
  /**
   * What to do with a text that carries no markers at all: `append`
   * (the default) lands the region after the existing content,
   * `prepend` before it, and `keep` leaves the text untouched — for a
   * region whose slot must already exist, like a hook step that would
   * run too late if appended after the gate.
   */
  readonly whenAbsent?: 'append' | 'prepend' | 'keep';
  /** Names the file (or the owner) in the broken-pair message; defaults to the opening marker. */
  readonly where?: string;
}

/**
 * Upserts a region into a text: replaces the sentinel-delimited
 * section when both markers are present, touching nothing around it,
 * and lands a fresh one where {@link UpsertRegionOptions.whenAbsent}
 * says when neither is. Its own fixed point — re-applying the same
 * body changes nothing — which is what lets `--reapply` re-render
 * it. CRLF text is normalized for the splice and restored after, so
 * a Windows checkout round-trips with one line ending — the file's,
 * whatever the body was authored with.
 */
export function upsertRegion(
  existing: string,
  region: Region,
  body: string,
  options: UpsertRegionOptions = {},
): string {
  if (existing.includes('\r\n')) {
    return upsertRegion(existing.replace(/\r\n/g, '\n'), region, body, options).replace(
      /\n/g,
      '\r\n',
    );
  }
  const gap = options.padding === 'blank' ? '\n\n' : '\n';
  // The body is authored, so it may arrive CRLF too (a template read
  // on Windows); it takes the file's line ending, never its own.
  const section = `${region.begin}${gap}${body.replace(/\r\n/g, '\n').trim()}${gap}${region.end}`;
  const span = locateRegion(existing, region, options.where ?? region.begin);
  if (span === null) {
    if (options.whenAbsent === 'keep') return existing;
    if (existing.trim() === '') return `${section}\n`;
    return options.whenAbsent === 'prepend'
      ? `${section}\n\n${existing.trimStart()}`
      : `${existing.trimEnd()}\n\n${section}\n`;
  }
  return `${existing.slice(0, span.begin)}${section}${existing.slice(span.end)}`;
}

/**
 * The text with every located region cut out, markers included —
 * what a transform declaring those regions must leave as it found
 * it. A region the text does not carry cuts nothing; a broken pair
 * throws as {@link locateRegion} does.
 */
export function outsideRegions(text: string, regions: readonly Region[], where: string): string {
  let rest = text;
  for (const region of regions) {
    const span = locateRegion(rest, region, where);
    if (span !== null) rest = `${rest.slice(0, span.begin)}${rest.slice(span.end)}`;
  }
  return rest;
}

/**
 * Whether a transform from `base` to `next` changed anything outside
 * `regions` — the check the engine runs on every patch that declares
 * them. Whitespace at either end of the file is forgiven: landing a
 * fresh region moves the file's last newline, and that is the seam
 * of the region, not prose outside it.
 */
export function escapesRegions(
  base: string,
  next: string,
  regions: readonly Region[],
  where: string,
): boolean {
  return (
    outsideRegions(base, regions, where).trim() !== outsideRegions(next, regions, where).trim()
  );
}

/** Inputs to {@link regionPatch}. */
export interface RegionPatchSpec extends UpsertRegionOptions {
  /** Path of the shared file, relative to the project root. */
  readonly target: string;
  /** The region this patch owns in it. */
  readonly region: Region;
  /** Markdown, shell, ini — whatever goes between the markers, without them. */
  readonly body: string;
  /**
   * Content the patch runs against when `target` does not exist yet;
   * supplying one turns the patch into an upsert two independent
   * adapters can both make against the same file, whichever runs
   * first creating it. Absent, a missing target stays a hard error.
   */
  readonly seed?: string;
  /** POSIX permission bits, for a seeded upsert that creates a script. */
  readonly mode?: number;
}

/**
 * A `ContributionPatch` that owns one region of a shared file: the
 * upsert as its transform, the region declared so the engine
 * verifies it. The one way to write such a patch, for keel's own
 * adapters and a plugin's alike. Typed structurally rather than as
 * `ContributionPatch` so this module stays a leaf; the result is
 * assignable to it.
 */
export function regionPatch(spec: RegionPatchSpec): {
  readonly target: string;
  readonly seed?: string;
  readonly mode?: number;
  readonly regions: readonly Region[];
  readonly apply: (existing: string) => string;
} {
  const { target, region, body, seed, mode, ...options } = spec;
  const where = options.where ?? target;
  return {
    target,
    ...(seed !== undefined ? { seed } : {}),
    ...(mode !== undefined ? { mode } : {}),
    regions: [region],
    apply: (existing) => upsertRegion(existing, region, body, { ...options, where }),
  };
}
