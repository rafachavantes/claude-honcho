#!/usr/bin/env bash
# Publish the built plugin to the release/honcho branch, which is what
# rafa-plugins/marketplace.json serves. Mirrors the "Push release branch"
# step of .github/workflows/release.yml; the npm publish step there needs
# the @honcho-ai scope, so this fork uses the branch channel only.
#
# The branch history is rebuilt from scratch on every release (git init in
# a fresh .stage), so the push is always a force push.
set -euo pipefail

cd "$(dirname "$0")/.."
REMOTE="${HONCHO_RELEASE_REMOTE:-https://github.com/rafachavantes/claude-honcho.git}"
VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n1)
[ -n "$VERSION" ] || { echo "could not read version from package.json" >&2; exit 1; }

bun run scripts/build.ts
bash scripts/smoke.sh .stage
claude plugin validate .stage --strict

cd .stage
git init -q -b release/honcho
git add -A
git commit -q -m "honcho v$VERSION"
git push -f "$REMOTE" release/honcho
echo "published honcho v$VERSION to release/honcho"
