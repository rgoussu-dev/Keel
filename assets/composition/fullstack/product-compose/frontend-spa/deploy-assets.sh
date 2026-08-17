#!/bin/sh
# Populates the shared assets volume (mounted at /assets). Clear
# first — stale files from the previous release must not survive —
# then copy the bundle, then template the runtime config from the
# environment (12-factor: config is injected at deploy time, never
# baked into the bundle; the app reads window.__ENV__ at boot).
set -eu
find /assets -mindepth 1 -delete
cp -R /bundle/. /assets/
cat > /assets/env.js <<EOF
window.__ENV__ = { API_BASE_URL: '${API_BASE_URL:-/api}' };
EOF
