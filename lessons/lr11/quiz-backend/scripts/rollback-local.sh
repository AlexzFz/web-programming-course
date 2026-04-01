#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

current_tag_file="./scripts/.release-current"
previous_tag_file="./scripts/.release-previous"

if [[ ! -f "$previous_tag_file" ]]; then
  echo "No previous release tag found. Rollback is not possible yet."
  exit 1
fi

rollback_tag="$(tr -d '\r\n' < "$previous_tag_file")"
if [[ -z "$rollback_tag" ]]; then
  echo "Previous release tag is empty."
  exit 1
fi

echo "Rolling back to: $rollback_tag"
BACKEND_IMAGE="$rollback_tag" docker compose up -d --no-build

echo "Smoke check after rollback: /health"
ok=0
for _ in {1..15}; do
  status="$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health || true)"
  if [[ "$status" == "200" ]]; then
    ok=1
    break
  fi
  sleep 2
done

if [[ "$ok" != "1" ]]; then
  docker compose logs --tail=40 backend || true
  echo "Rollback smoke check failed."
  exit 1
fi

printf '%s' "$rollback_tag" > "$current_tag_file"
echo "Rollback succeeded. Active tag: $rollback_tag"
