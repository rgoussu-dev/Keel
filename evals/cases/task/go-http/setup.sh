#!/usr/bin/env bash
# Injects the failing test. Run with the workspace as cwd.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
cp "$here/files/farewell_test.go" internal/modules/greeting/userside/resthttp/farewell_test.go
