#!/usr/bin/env bash
# The oracle: the injected test passes AND the whole build stays
# green. Run with the workspace as cwd; exit 0 is a pass.
set -euo pipefail
test -f internal/modules/greeting/userside/resthttp/farewell_test.go
git diff --quiet -- internal/modules/greeting/userside/resthttp/farewell_test.go 2>/dev/null ||
  { echo "the injected test was modified" >&2; exit 1; }
go test ./internal/modules/greeting/userside/resthttp/ -run 'TestFarewell' -count=1
go build ./...
go test ./... -count=1
