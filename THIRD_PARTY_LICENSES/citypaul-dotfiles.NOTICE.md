# Notice — citypaul/.dotfiles

Portions of this repository are derived from
[`citypaul/.dotfiles`](https://github.com/citypaul/.dotfiles), a personal
dotfiles repository by Paul Hammond that bundles a Claude Code methodology
blending TDD and Extreme Programming.

- **Upstream**: https://github.com/citypaul/.dotfiles
- **License**: MIT (see [`citypaul-dotfiles.LICENSE`](./citypaul-dotfiles.LICENSE))
- **Copyright**: © 2024 Paul Hammond
- **Pinned upstream commit**: `a4b6c4696f54006c2140db58b2a306ccb282740d`
  (`chore: version packages (#138)`)

The pinned commit is the provenance reference for every artifact listed
below. When refreshing imports, bump the SHA here and re-record the deltas
per row.

## Imported / adapted artifacts

Each row tracks one file that was either copied verbatim or adapted from
the upstream pinned commit. When a row is added, the corresponding file in
this repository must carry a header that points back to the upstream path
and SHA — see [`HEADER_TEMPLATE.md`](./HEADER_TEMPLATE.md).

| Local path                           | Upstream path                         | Type    | Notes                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------ | ------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| assets/global/agents/tdd-guardian.md | claude/.claude/agents/tdd-guardian.md | Adapted | Vocabulary translated to keel (Scenario+Factory+fakes, Mediator/Handler/Result, hexagonal layers); MUTATE/KILL phase made conditional on mutation tooling being wired; test-framework references made language-agnostic via assets/conventions/languages.json.                                                                                                         |
| assets/global/agents/pr-reviewer.md  | claude/.claude/agents/pr-reviewer.md  | Adapted | Five review categories restructured: replaced TS-only "TypeScript Strictness" with generic "Language Strictness" (per-language ruleset from assets/conventions/languages.json) and added "Hexagonal Layer Compliance" as a dedicated category; anti-patterns rewritten in keel vocabulary; scope of applicability documented (PRs are an exception under trunk-based). |
| assets/global/agents/learn.md        | claude/.claude/agents/learn.md        | Adapted | Distinguishes project-level CLAUDE.md (default destination) from keel's binding spec assets/global/CLAUDE.md (rare, maintainer-only); examples translated to keel vocabulary; explicit handoff to adr agent for "why we chose X" learnings.                                                                                                                            |
| assets/global/agents/adr.md          | claude/.claude/agents/adr.md          | Adapted | DO-NOT list extended with "standard patterns from assets/global/CLAUDE.md"; DO list extended with keel-flavoured examples (mediator vs alternatives, schematic-engine choice, OpenTofu); progress-guardian reference marked "if installed" pending keel roadmap.                                                                                                       |

### Type legend

- **Verbatim** — file copied unchanged. Header references upstream only.
- **Adapted** — file modified for keel conventions. Header references
  upstream and lists substantive changes.
- **Inspired** — independent rewrite that reuses no expression from
  upstream but is conceptually derived. Header acknowledges inspiration;
  no MIT obligation but credit is given.

Anything more than `Inspired` triggers the MIT obligations: preserve the
copyright, preserve the permission notice (via this directory), and link
back to the source.

## Refreshing the pinned commit

1. Update the `Pinned upstream commit` line above to the new SHA.
2. For each row in the table, diff the upstream file at the new SHA
   against the previous SHA. Reconcile any drift in our local copy.
3. If an upstream file was deleted, mark the row `(removed upstream)` and
   decide whether to keep the local version (with frozen attribution) or
   drop it.
