#!/usr/bin/env bash
# The oracle: the injected test passes AND the whole gate stays green,
# the SPA build included — a domain that reaches for the DOM compiles
# here and fails there.
set -euo pipefail
test -f domain/domain-core/tests/farewell.test.ts
git diff --quiet -- domain/domain-core/tests/farewell.test.ts 2>/dev/null ||
  { echo "the injected test was modified" >&2; exit 1; }
npm run typecheck
npm test
npm run build
