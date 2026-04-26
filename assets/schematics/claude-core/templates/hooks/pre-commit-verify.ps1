#!/usr/bin/env pwsh
# PreToolUse: block `git commit` unless typecheck + tests pass.
$ErrorActionPreference = 'SilentlyContinue'

$raw = [Console]::In.ReadToEnd()
try { $json = $raw | ConvertFrom-Json } catch { exit 0 }
$cmd = $json.tool_input.command
if (-not $cmd) { exit 0 }
if ($cmd -notmatch '(^|&&|;)\s*git\s+commit') { exit 0 }

function Fail($msg) { [Console]::Error.WriteLine($msg); exit 1 }

if (Test-Path './gradlew.bat') {
  & ./gradlew.bat --quiet check | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "gradle check failed — fix before committing" }
}

if ((Test-Path 'package.json') -and (Get-Command pnpm -ErrorAction SilentlyContinue)) {
  & pnpm --silent run typecheck | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "typecheck failed — fix before committing" }
  & pnpm --silent run test | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "tests failed — fix before committing" }
}

if ((Test-Path 'Cargo.toml') -and (Get-Command cargo -ErrorAction SilentlyContinue)) {
  & cargo check --quiet | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "cargo check failed — fix before committing" }
  & cargo test --quiet | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "cargo test failed — fix before committing" }
}

if ((Test-Path 'go.mod') -and (Get-Command go -ErrorAction SilentlyContinue)) {
  & go vet ./... | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "go vet failed — fix before committing" }
  & go test ./... | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail "go test failed — fix before committing" }
}

exit 0
