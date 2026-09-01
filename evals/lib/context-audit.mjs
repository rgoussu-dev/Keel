/**
 * Static context-budget audit: what the emitted harness asks an
 * AGENTS.md-reading agent to load before it has done anything —
 * every `AGENTS.md`/`CLAUDE.md` in the tree plus the on-demand skill
 * bodies under `.claude/skills/`. Sizes only, no agent involved, so
 * it runs in `verify` and rides along in every benchmark: the
 * before/after number the harness redesign (#147) is judged on.
 */

import fs from 'node:fs';
import path from 'node:path';

const CONTEXT_FILE = /^(AGENTS|CLAUDE)\.md$/;
const SKIPPED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'target']);

/** Recursively collects the agent-context files under `workspace`. */
function contextFiles(workspace) {
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(full);
        continue;
      }
      const rel = path.relative(workspace, full);
      if (
        CONTEXT_FILE.test(entry.name) ||
        (rel.startsWith(path.join('.claude', 'skills')) && entry.name === 'SKILL.md')
      ) {
        found.push(rel.split(path.sep).join('/'));
      }
    }
  };
  walk(workspace);
  return found.sort();
}

/**
 * Audits one workspace. `approxTokens` is bytes/4 — a deliberate,
 * labeled approximation: good enough to compare a harness against
 * itself across the redesign, useless as an absolute claim.
 */
export function auditContext(workspace) {
  const files = contextFiles(workspace).map((rel) => {
    const text = fs.readFileSync(path.join(workspace, rel), 'utf8');
    const bytes = Buffer.byteLength(text);
    return { path: rel, lines: text.split('\n').length, bytes, approxTokens: Math.ceil(bytes / 4) };
  });
  return {
    files,
    totalLines: files.reduce((n, f) => n + f.lines, 0),
    totalBytes: files.reduce((n, f) => n + f.bytes, 0),
    approxTokens: files.reduce((n, f) => n + f.approxTokens, 0),
  };
}
