#!/usr/bin/env bash
# Reference solution proving the case solvable: writes exactly what a
# correct agent would. Run with the workspace as cwd.
set -euo pipefail
mkdir -p .keel-eval
cat > .keel-eval/answers.txt <<'EOF'
wiring=application/api/src/main/java/com/acme/eval/application/api/ShippingWiring.java
gateway=modules/shipping/infra/ordering-gateway/src/main/java/com/acme/eval/shipping/infra/orderinggateway/OrderingGateway.java
migration=migrations/sql/V1__create_greeting.sql
EOF
