#!/usr/bin/env bash
# Crowbar - Stop all development services
# Run from project root: ./scripts/stop.sh

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "Stopping Docker containers..."
cd "$ROOT/server"
docker compose down
cd "$ROOT"
echo "Done. Docker containers stopped."
echo ""
echo "Note: If you started services with ./scripts/dev.sh, those processes"
echo "      were already stopped when you pressed Ctrl+C."
