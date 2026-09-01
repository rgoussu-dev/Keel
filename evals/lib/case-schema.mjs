/**
 * Case and campaign loading for the harness evals rig.
 *
 * A case is agent-neutral data (`evals/cases/<name>/case.yaml`):
 * nothing agent-specific may appear in one — drivers own the mapping
 * from case concepts (prompt, budgets, autonomy) to CLI flags. The
 * zod schemas here are the whole contract; the runner and the
 * verify-time suites both load through them, so a malformed case
 * fails loudly in both paths, naming its file.
 */

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

/** One growth step: `keel add module <name>` or `keel add <vertical>`. */
const growStepSchema = z.union([
  z.object({ module: z.string().min(1), consumes: z.string().min(1).optional() }).strict(),
  z.object({ vertical: z.string().min(1) }).strict(),
]);

/**
 * What to build the workspace from. Replayed through the packaged
 * CLI by the live runner and through the in-process mediator by the
 * verify suites (`tests/support/evals-fixture.ts`) — same commands,
 * same engine, same tree.
 */
const scaffoldSchema = z
  .object({
    stack: z.string().min(1),
    build_system: z.string().min(1).optional(),
    module_layout: z.string().min(1).optional(),
    /** Sticky answers, `adapterId → questionId → value`. */
    answers: z.record(z.record(z.string())).optional(),
    /** Ordered growth steps — order is load-bearing (see case files). */
    grow: z.array(growStepSchema).optional(),
  })
  .strict();

/**
 * How the final workspace is judged. Agent output is never graded —
 * only workspace state:
 *   - `answers` + `answers_file`: the probe contract — the prompt
 *     tells the agent to write `key=value` lines into the file; each
 *     entry here must match exactly (after trimming) — the
 *     "exact path/string match" grading of lane A;
 *   - `script`: an executable run with the workspace as cwd, exit 0
 *     is a pass — the general mechanism for later lanes;
 *   - `clean_worktree`: when true, any tracked change beyond the
 *     answers file fails the case (read-only probes).
 * At least one of `answers` / `script` must be present.
 */
const oracleSchema = z
  .object({
    answers_file: z.string().min(1).optional(),
    answers: z.record(z.string()).optional(),
    script: z.string().min(1).optional(),
    clean_worktree: z.boolean().optional(),
  })
  .strict()
  .refine((o) => o.answers !== undefined || o.script !== undefined, {
    message: 'oracle needs `answers` and/or `script`',
  })
  .refine((o) => o.answers === undefined || o.answers_file !== undefined, {
    message: '`answers` grading needs `answers_file`',
  });

/** Wall-clock and turn budgets. USD is never a budget (billing posture). */
const budgetsSchema = z
  .object({
    timeout_seconds: z.number().int().positive(),
    max_turns: z.number().int().positive().optional(),
  })
  .strict();

export const caseSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9/-]+$/, 'lowercase slug with / separators'),
    tags: z.array(z.string().min(1)).min(1),
    scaffold: scaffoldSchema,
    setup_script: z.string().min(1).optional(),
    prompt: z.string().min(1),
    oracle: oracleSchema,
    budgets: budgetsSchema,
    runs: z.number().int().positive().default(3),
  })
  .strict();

export const campaignSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    /** Case directories relative to `evals/cases/`. */
    cases: z.array(z.string().min(1)).min(1),
    /** Overrides every case's own `runs` when present. */
    runs: z.number().int().positive().optional(),
  })
  .strict();

/** Loads and validates one case; `dir` is the case directory. */
export function loadCase(dir) {
  const file = path.join(dir, 'case.yaml');
  const parsed = caseSchema.safeParse(parseYaml(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      `${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join('; ')}`,
    );
  }
  return { ...parsed.data, dir };
}

/** Loads a campaign and every case it names, in order. */
export function loadCampaign(file, casesRoot) {
  const parsed = campaignSchema.safeParse(parseYaml(fs.readFileSync(file, 'utf8')));
  if (!parsed.success) {
    throw new Error(
      `${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join('; ')}`,
    );
  }
  const campaign = parsed.data;
  const cases = campaign.cases.map((rel) => loadCase(path.join(casesRoot, rel)));
  const ids = new Set();
  for (const c of cases) {
    if (ids.has(c.id)) throw new Error(`${file}: duplicate case id '${c.id}'`);
    ids.add(c.id);
  }
  return { ...campaign, resolved: cases };
}
