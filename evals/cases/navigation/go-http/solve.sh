#!/usr/bin/env bash
# Reference solution proving the case solvable: writes exactly what a
# correct agent would. Run with the workspace as cwd.
set -euo pipefail
mkdir -p .keel-eval
cat > .keel-eval/answers.txt <<'EOF'
wiring=cmd/http/shipping.go
gateway=internal/modules/shipping/infra/orderinggateway/gateway.go
migration=migrations/sql/V1__create_greeting.sql
EOF
