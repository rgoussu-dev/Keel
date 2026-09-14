#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
dest=application/api/src/test/java/com/example/application/api
mkdir -p "$dest"
cp "$here/files/FarewellResourceTest.java" "$dest/FarewellResourceTest.java"
