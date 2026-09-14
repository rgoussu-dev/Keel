#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
cp "$here/files/farewell.test.ts" application/rest/tests/farewell.test.ts
