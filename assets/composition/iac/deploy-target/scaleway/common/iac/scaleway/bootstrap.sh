#!/usr/bin/env sh
# One-shot: provision the remote-state bucket, then point the main
# config at it. See README.md for the credentials each step reads
# from the environment.
set -eu
cd "$(dirname "$0")"
tofu -chdir=bootstrap init
tofu -chdir=bootstrap apply
tofu init
