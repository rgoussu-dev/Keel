#!/usr/bin/env bash
# Reference solution proving the case solvable: writes exactly what a
# correct agent would. Run with the workspace as cwd.
set -euo pipefail
mkdir -p .keel-eval
cat > .keel-eval/answers.txt <<'ANSWERS'
gateway=frontend/infrastructure/gateway-rest/src/rest-greet-gateway.ts
cors=backend/application/rest/executable/src/main/resources/application.properties
contract=backend/contract/greet.openapi.yaml
ANSWERS
