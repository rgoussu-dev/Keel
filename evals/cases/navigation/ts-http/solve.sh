#!/usr/bin/env bash
# Reference solution proving the case solvable: writes exactly what a
# correct agent would. Run with the workspace as cwd.
set -euo pipefail
mkdir -p .keel-eval
cat > .keel-eval/answers.txt <<'EOF'
wiring=application/rest/src/shipping.ts
gateway=modules/shipping/src/infra/ordering-gateway/index.ts
migration=migrations/sql/V1__create_greeting.sql
EOF
