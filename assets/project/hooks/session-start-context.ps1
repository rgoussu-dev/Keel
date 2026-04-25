#!/usr/bin/env pwsh
# SessionStart hook: compact context snapshot.
$ErrorActionPreference = 'SilentlyContinue'

Write-Output "=== keel session context ==="

if (git rev-parse --git-dir 2>$null) {
  $branch = git rev-parse --abbrev-ref HEAD 2>$null
  Write-Output "branch: $branch"
  $dirty = (git status --porcelain | Measure-Object).Count
  Write-Output "uncommitted files: $dirty"
  Write-Output "--- recent commits ---"
  git log --oneline -n 5 2>$null
}

Write-Output "--- walking skeleton markers ---"
@(
  @{ path = 'domain/contract';     note = 'ports + mediator kernel expected here' }
  @{ path = 'application';         note = 'interface layer expected here' }
  @{ path = 'infrastructure';      note = 'adapters expected here' }
) | ForEach-Object {
  if (Test-Path $_.path) { Write-Output "found: $($_.path)" }
  else                   { Write-Output "missing: $($_.path) ($($_.note))" }
}

$iac = @('iac','infrastructure/iac','infra') | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($iac) { Write-Output "found: IaC at $iac" } else { Write-Output "missing: IaC (OpenTofu expected at /iac/)" }

exit 0
