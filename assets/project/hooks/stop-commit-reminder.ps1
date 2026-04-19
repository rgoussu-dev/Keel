#!/usr/bin/env pwsh
# Stop hook: commit reminder when there are uncommitted changes.
$ErrorActionPreference = 'SilentlyContinue'

if (-not (git rev-parse --git-dir 2>$null)) { exit 0 }
$dirty = (git status --porcelain | Measure-Object).Count
if ($dirty -eq 0) { exit 0 }

@"
=== keel: commit reminder ===
Uncommitted changes detected. Trunk-based workflow expects small, frequent commits.

Checklist:
  - One logical unit per commit (no mixing refactor + feature + fix).
  - Conventional Commits format: <type>(<scope>): <subject>.
  - Types: feat, fix, refactor, docs, test, chore, build, ci, perf, style.
  - Run /commit to verify + commit + push through the standard flow.
"@ | Write-Output

exit 0
