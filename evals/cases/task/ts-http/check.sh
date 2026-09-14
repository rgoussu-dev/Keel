#!/usr/bin/env bash
# The oracle: the injected test passes AND the whole gate stays green.
set -euo pipefail
test -f application/rest/tests/farewell.test.ts
git diff --quiet -- application/rest/tests/farewell.test.ts 2>/dev/null ||
  { echo "the injected test was modified" >&2; exit 1; }
npm run typecheck
npm test
npm run lint
