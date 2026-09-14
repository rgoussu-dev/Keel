#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
cp "$here/files/farewell.rs" modules/greeting/domain/contract/tests/farewell.rs
