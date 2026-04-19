# keel — Claude Code workspace

This repo has a project-local CLAUDE.md so preferences persist across cloud
sessions (the harness does not retain `~/.claude/CLAUDE.md` between runs).

## Workflow preferences

### Pull requests

- After creating a PR, automatically subscribe to its activity with
  `mcp__github__subscribe_pr_activity` — do not ask first. Then check current
  CI status and any unresolved review comments, and address anything that
  needs attention per the usual rules (fix if confident and small, ask if
  ambiguous or architecturally significant, skip if no action is needed).
