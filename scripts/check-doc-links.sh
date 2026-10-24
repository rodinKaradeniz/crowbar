#!/usr/bin/env bash

# Every relative Markdown link in README.md, AGENTS.md and docs/ must point at
# a file or directory that exists. Anchors are stripped, not checked; external
# links (http, https, mailto) are out of scope.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

broken=0
while IFS= read -r file; do
  dir="$(dirname "$file")"
  while IFS= read -r target; do
    case "$target" in http://* | https://* | mailto:* | \#*) continue ;; esac
    target="${target%%#*}"
    target="${target%% *}"
    [[ -z "$target" ]] && continue
    if [[ ! -e "$dir/$target" ]]; then
      echo "$file: broken link -> $target"
      broken=1
    fi
  done < <(grep -o '](<\{0,1\}[^)>]*' "$file" | sed 's/^](<\{0,1\}//')
done < <(printf '%s\n' README.md AGENTS.md; find docs -name '*.md' | sort)

if [[ "$broken" != 0 ]]; then
  exit 1
fi
echo "Documentation links resolve."
