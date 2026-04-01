#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

timestamp="$(date +%Y%m%d-%H%M%S)"
new_tag="quiz-backend:release-$timestamp"
current_tag_file="./scripts/.release-current"
previous_tag_file="./scripts/.release-previous"

if [[ -f "$current_tag_file" ]]; then
  current_tag="$(tr -d '\r\n' < "$current_tag_file")"
  if [[ -n "$current_tag" ]]; then
    printf '%s' "$current_tag" > "$previous_tag_file"
  fi
fi

echo "Building new image: $new_tag"
docker build -t "$new_tag" .

echo "Starting compose with tag: $new_tag"
BACKEND_IMAGE="$new_tag" docker compose up -d --no-build

echo "Smoke check: /health"
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
  echo "Smoke check failed. Run rollback script: ./scripts/rollback-local.sh"
  exit 1
fi

printf '%s' "$new_tag" > "$current_tag_file"
echo "Release succeeded. Current tag: $new_tag"
