#!/usr/bin/env bash
# The oracle: the injected test passes AND the whole build stays
# green. `./gradlew build` runs the injected test too, so the first
# invocation is the fast diagnosis and the second is the claim.
set -euo pipefail
spec=application/api/src/test/java/com/example/application/api/FarewellResourceTest.java
test -f "$spec"
git diff --quiet -- "$spec" 2>/dev/null ||
  { echo "the injected test was modified" >&2; exit 1; }
./gradlew :application:api:test --tests '*FarewellResourceTest' -q
./gradlew build -q
