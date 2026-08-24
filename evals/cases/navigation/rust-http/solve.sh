#!/usr/bin/env bash
# Reference solution proving the case solvable: writes exactly what a
# correct agent would. Run with the workspace as cwd.
set -euo pipefail
mkdir -p .keel-eval
cat > .keel-eval/answers.txt <<'EOF'
wiring=application/http/src/shipping.rs
gateway=modules/shipping/infra/ordering-gateway/src/lib.rs
migration=migrations/sql/V1__create_greeting.sql
EOF
