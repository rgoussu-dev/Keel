#!/usr/bin/env pwsh
# PostToolUse hook: formats the edited file based on extension.
$ErrorActionPreference = 'SilentlyContinue'

$raw  = [Console]::In.ReadToEnd()
try   { $json = $raw | ConvertFrom-Json } catch { exit 0 }
$file = $json.tool_input.file_path
if (-not $file -or -not (Test-Path $file)) { exit 0 }

$ext = [IO.Path]::GetExtension($file).ToLower()
switch ($ext) {
  { $_ -in '.java','.kt','.kts' } {
    if (Test-Path './gradlew.bat') { & ./gradlew.bat spotlessApply "-PspotlessFiles=$file" | Out-Null }
  }
  { $_ -in '.ts','.tsx','.js','.jsx','.json','.md','.yaml','.yml' } {
    if (Get-Command pnpm -ErrorAction SilentlyContinue) { & pnpm exec prettier --write $file | Out-Null }
    elseif (Get-Command npx -ErrorAction SilentlyContinue) { & npx prettier --write $file | Out-Null }
  }
  '.rs' {
    if (Get-Command rustfmt -ErrorAction SilentlyContinue) { & rustfmt $file | Out-Null }
  }
  '.go' {
    if (Get-Command gofmt -ErrorAction SilentlyContinue) { & gofmt -w $file | Out-Null }
  }
  { $_ -in '.tf','.tofu' } {
    if (Get-Command tofu -ErrorAction SilentlyContinue) { & tofu fmt $file | Out-Null }
  }
}
exit 0
