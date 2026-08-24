#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: bash scripts/export-portfolio.sh /path/to/new-empty-directory" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
destination="$1"
if [[ -e "$destination" ]]; then
  echo "Refusing to write into an existing path: $destination" >&2
  exit 2
fi

allowlist=(
  README.md LICENSE SECURITY.md
  portfolio-docs
  client/app client/components client/content client/contexts client/hooks client/lib
  client/scripts client/tests client/types client/styles client/proxy.ts
  client/package.json client/package-lock.json client/next.config.ts client/tsconfig.json
  client/postcss.config.mjs client/eslint.config.mjs client/vitest.config.ts
  client/components.json client/env.example
  client/public/file.svg client/public/globe.svg client/public/next.svg
  client/public/vercel.svg client/public/window.svg client/public/widget.js
  server/app server/db/__init__.py server/db/migrate.py server/db/migrations
  server/db/seeds server/tests server/requirements.txt server/docker-compose.yml
  server/requirements-test.txt server/requirements.lock server/requirements-test.lock
  server/env.example server/pytest.ini server/railway.api.json server/.dockerignore
  ml/src ml/tests ml/requirements.txt ml/requirements.lock ml/requirements-test.txt
  ml/requirements-test.lock ml/env.example
  ml/Dockerfile ml/.dockerignore
  scripts/dev.sh scripts/export-portfolio.sh scripts/verify-fresh-db.sh
  .dockerignore .gitignore .gitleaks.toml .github/dependabot.yml .github/workflows
)

mkdir -p "$destination"
cd "$repo_root"
git ls-files -z -- "${allowlist[@]}" | while IFS= read -r -d '' source_path; do
  case "$source_path" in
    *.jpg|*.jpeg|*.png|*.webp|*.ipynb|*.env|.claude/*|.agents/*|.codex/*)
      echo "Allowlist produced a forbidden path: $source_path" >&2
      exit 1
      ;;
  esac
  mkdir -p "$destination/$(dirname "$source_path")"
  cp -p "$source_path" "$destination/$source_path"
done

required_export_files=(
  README.md LICENSE SECURITY.md portfolio-docs/PUBLICATION_CHECKLIST.md
  client/proxy.ts client/scripts/build-doc-chunks.mjs client/tests/setup.ts
  server/db/migrate.py server/db/migrations/043_business_privacy_contact.sql
  server/requirements.lock ml/Dockerfile ml/requirements.lock
  .github/workflows/ci.yml .github/workflows/supply-chain.yml
)
for required_path in "${required_export_files[@]}"; do
  if [[ ! -f "$destination/$required_path" ]]; then
    echo "Export is incomplete; commit the intended source first: $required_path" >&2
    exit 1
  fi
done

if rg -n --glob '!**/scripts/export-portfolio.sh' \
  '/Users/|railway\.app|BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY' "$destination"; then
  echo "Export failed its public-content guard" >&2
  exit 1
fi

if rg -n --glob '!**/scripts/export-portfolio.sh' --glob '!**/server/db/migrate.py' \
  'password123([^0-9]|$)' "$destination"; then
  echo "Export failed its public-content guard" >&2
  exit 1
fi

echo "Portfolio export created at $destination; run the publication checklist before publishing."
