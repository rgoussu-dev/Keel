/**
 * Line-based unified diff — how reapply shows what a re-render would
 * change in the working tree. Deliberately dependency-free: the input
 * is two rendered texts, the output is unified-diff hunks (without the
 * `---`/`+++` file header, which the caller renders alongside the
 * path).
 *
 * The line alignment is a longest-common-subsequence over trimmed
 * texts (the common prefix and suffix are stripped first, which is the
 * whole file for the typical template tweak). Inputs whose divergent
 * middles are too large for the quadratic table fall back to one
 * whole-middle replacement hunk — still a correct diff, just not a
 * minimal one.
 */

/** Context lines shown around each change, as in `diff -u`. */
const CONTEXT = 3;

/** Middle sizes beyond this (product of line counts) skip the LCS. */
const LCS_CELL_BUDGET = 4_000_000;

/**
 * A text ending without a final newline diffs as if this pseudo-line
 * followed its last line — the standard `diff -u` annotation, carried
 * through the line machinery instead of special-cased around it.
 */
const NO_EOL_MARKER = '\\ No newline at end of file';

/**
 * Renders the unified-diff hunks turning `oldText` into `newText`.
 * Returns the empty string when the texts are identical.
 */
export function unifiedDiff(oldText: string, newText: string): string {
  if (oldText === newText) return '';
  const a = toLines(oldText);
  const b = toLines(newText);

  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  )
    suffix += 1;

  const ops: Op[] = [
    ...a.slice(0, prefix).map((line): Op => ({ kind: 'equal', line })),
    ...diffMiddle(a.slice(prefix, a.length - suffix), b.slice(prefix, b.length - suffix)),
    ...a.slice(a.length - suffix).map((line): Op => ({ kind: 'equal', line })),
  ];
  return renderHunks(ops);
}

type Op =
  | { kind: 'equal'; line: string }
  | { kind: 'del'; line: string }
  | { kind: 'add'; line: string };

function toLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  else lines.push(NO_EOL_MARKER);
  return lines;
}

function diffMiddle(a: readonly string[], b: readonly string[]): Op[] {
  if (a.length * b.length > LCS_CELL_BUDGET) {
    return [
      ...a.map((line): Op => ({ kind: 'del', line })),
      ...b.map((line): Op => ({ kind: 'add', line })),
    ];
  }
  // lcs[i * width + j] = LCS length of a[i:] and b[j:].
  const width = b.length + 1;
  const lcs = new Uint32Array((a.length + 1) * width);
  const lcsAt = (i: number, j: number): number => lcs[i * width + j] ?? 0;
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        a[i] === b[j] ? lcsAt(i + 1, j + 1) + 1 : Math.max(lcsAt(i + 1, j), lcsAt(i, j + 1));
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'equal', line: a[i] ?? '' });
      i += 1;
      j += 1;
    } else if (lcsAt(i + 1, j) >= lcsAt(i, j + 1)) {
      ops.push({ kind: 'del', line: a[i] ?? '' });
      i += 1;
    } else {
      ops.push({ kind: 'add', line: b[j] ?? '' });
      j += 1;
    }
  }
  for (; i < a.length; i += 1) ops.push({ kind: 'del', line: a[i] ?? '' });
  for (; j < b.length; j += 1) ops.push({ kind: 'add', line: b[j] ?? '' });
  return ops;
}

function renderHunks(ops: readonly Op[]): string {
  const out: string[] = [];
  let oldLine = 1;
  let newLine = 1;
  let index = 0;
  while (index < ops.length) {
    if (ops[index]?.kind === 'equal') {
      oldLine += 1;
      newLine += 1;
      index += 1;
      continue;
    }
    // A change at `index`: the hunk spans every change within
    // 2×CONTEXT equal lines of the previous one, as `diff -u` groups.
    let end = index;
    let equalRun = 0;
    for (let k = index; k < ops.length; k += 1) {
      if (ops[k]?.kind === 'equal') {
        equalRun += 1;
        if (equalRun > CONTEXT * 2) break;
      } else {
        equalRun = 0;
        end = k;
      }
    }
    const lead = Math.min(CONTEXT, countEqual(ops, index, -1));
    const trail = Math.min(CONTEXT, countEqual(ops, end, +1));
    const hunkStart = index - lead;
    const hunkEnd = end + trail;
    const body: string[] = [];
    let oldCount = 0;
    let newCount = 0;
    for (let k = hunkStart; k <= hunkEnd; k += 1) {
      const op = ops[k];
      if (op === undefined) continue;
      body.push(`${op.kind === 'equal' ? ' ' : op.kind === 'del' ? '-' : '+'}${op.line}`);
      if (op.kind !== 'add') oldCount += 1;
      if (op.kind !== 'del') newCount += 1;
    }
    out.push(`@@ -${oldLine - lead},${oldCount} +${newLine - lead},${newCount} @@`, ...body);
    for (let k = index; k <= hunkEnd; k += 1) {
      if (ops[k]?.kind !== 'add') oldLine += 1;
      if (ops[k]?.kind !== 'del') newLine += 1;
    }
    index = hunkEnd + 1;
  }
  return out.join('\n');
}

function countEqual(ops: readonly Op[], from: number, step: -1 | 1): number {
  let n = 0;
  while (from + step * (n + 1) >= 0 && from + step * (n + 1) < ops.length) {
    if (ops[from + step * (n + 1)]?.kind !== 'equal') break;
    n += 1;
  }
  return n;
}
