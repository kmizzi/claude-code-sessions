#!/usr/bin/env bash
set -euo pipefail

# Claude Code Sessions — one-command setup
# Usage: ./scripts/setup.sh [--service]
#
# Installs dependencies, builds the app, and optionally installs
# as a macOS launchd service that starts on login.

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-5858}"

info()  { printf "\033[1;34m==>\033[0m %s\n" "$1"; }
ok()    { printf "\033[1;32m==>\033[0m %s\n" "$1"; }
warn()  { printf "\033[1;33m==>\033[0m %s\n" "$1"; }
fail()  { printf "\033[1;31m==>\033[0m %s\n" "$1" >&2; exit 1; }

# Check Node.js version
if ! command -v node &>/dev/null; then
  fail "Node.js is required (v20+). Install it from https://nodejs.org"
fi
NODE_MAJOR=$(node -e 'console.log(process.versions.node.split(".")[0])')
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js 20+ is required (found v$(node -v)). Please upgrade."
fi

cd "$REPO_DIR"

# Install dependencies
info "Installing dependencies..."
npm install --no-audit --no-fund 2>&1 | tail -3

# Build
info "Building production bundle..."
npm run build 2>&1 | tail -5

ok "Build complete!"

# Service install (macOS only)
if [[ "${1:-}" == "--service" ]]; then
  if [[ "$(uname)" != "Darwin" ]]; then
    warn "launchd service is macOS only — skipping service install."
  else
    info "Installing launchd service on port $PORT..."
    node ./bin/claude-code-sessions.mjs install-service --port "$PORT"
    ok "Service installed! Open http://localhost:$PORT"
  fi
else
  ok "Ready! Start with: npm start"
  echo ""
  echo "  npm run dev          # development mode (hot reload)"
  echo "  npm start            # production mode"
  echo "  ./scripts/setup.sh --service  # install as background service"
  echo ""
  echo "  Open http://localhost:$PORT"
fi
