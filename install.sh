#!/usr/bin/env bash
# Deps/build authority for msss-urgences-cli. Everything beyond npm install +
# build lives here; the repo-shape conventions (trust skills, env, manifest)
# are applied separately by install-repo.sh.
set -euo pipefail

npm install
npm run build
