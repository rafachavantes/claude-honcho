#!/usr/bin/env bash
# Publish the built plugin to the release/honcho branch, which is what
# rafa-plugins/marketplace.json serves. Mirrors the "Push release branch"
# step of .github/workflows/release.yml; the npm publish step there needs
# the @honcho-ai scope, so this fork uses the branch channel only.
#
# The branch history is rebuilt from scratch on every release (git init in
# a fresh .stage), so the push is always a force push. That makes the branch
# a pure mirror of one build — nothing is ever merged into it, and nothing
# but a previous release can be lost.
set -euo pipefail

cd "$(dirname "$0")/.."
REMOTE="${HONCHO_RELEASE_REMOTE:-https://github.com/rafachavantes/claude-honcho.git}"

# RELEASE_VERSION would override the stamp inside build.ts, leaving the commit
# message and the bundle disagreeing. Refuse rather than publish a mismatch.
if [ -n "${RELEASE_VERSION:-}" ]; then
  echo "RELEASE_VERSION is set ($RELEASE_VERSION); unset it — the version comes from package.json" >&2
  exit 1
fi

VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' package.json | head -n1)
[ -n "$VERSION" ] || { echo "could not read version from package.json" >&2; exit 1; }

# A release must be reproducible from a commit. Publishing a dirty tree
# yields a bundle that exists nowhere in history.
if [ -n "$(git status --porcelain -- . ../../. 2>/dev/null)" ]; then
  echo "working tree is dirty — commit or stash before releasing" >&2
  git status --short | head -20 >&2
  exit 1
fi

echo "releasing $VERSION from $(git rev-parse --short HEAD) ($(git rev-parse --abbrev-ref HEAD))"

# Full gate: tsc and the suite are not in ci.yml, so this is the only place
# they gate a release.
bunx tsc --noEmit
bun test
bun run scripts/build.ts
bash scripts/smoke.sh .stage
claude plugin validate .stage --strict

[ "$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' .stage/.claude-plugin/plugin.json | head -n1)" = "$VERSION" ] \
  || { echo "staged version does not match package.json" >&2; exit 1; }

cd .stage
git init -q -b release/honcho
# The workflow sets an identity explicitly; a machine without a global one
# would otherwise fail at commit time, after the whole gate has run.
git config user.name "$(git -C .. config user.name || echo Rafa)"
git config user.email "$(git -C .. config user.email || echo contato@moara.digital)"
git add -A
git commit -q -m "honcho v$VERSION"
git push -f "$REMOTE" release/honcho
echo "published honcho v$VERSION to release/honcho"
