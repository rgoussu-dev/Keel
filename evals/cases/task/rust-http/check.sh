#!/usr/bin/env bash
# The oracle: the injected test passes AND the whole workspace stays
# green and formatted.
set -euo pipefail
test -f modules/greeting/domain/contract/tests/farewell.rs
git diff --quiet -- modules/greeting/domain/contract/tests/farewell.rs 2>/dev/null ||
  { echo "the injected test was modified" >&2; exit 1; }
cargo test -p greeting-domain-contract --test farewell
cargo test --workspace
cargo fmt --check
