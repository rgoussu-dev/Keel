#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
cp "$here/files/farewell.test.ts" domain/domain-core/tests/farewell.test.ts
