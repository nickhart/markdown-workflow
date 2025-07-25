#!/bin/bash
set -euo pipefail

# Check if all required CI jobs passed or were skipped
# Usage: check-ci-status.sh '<json-needs-object>'

needs_json="$1"

# Extract failed jobs using jq
failed_jobs=$(echo "$needs_json" | jq -r '
  ["build", "test", "lint", "format", "e2e"][] as $job |
  select(.[$job] and .[$job].result != "success" and .[$job].result != "skipped") |
  $job
' | tr '\n' ' ')

if [[ -n "$failed_jobs" ]]; then
  echo "❌ Failed jobs: $failed_jobs"
  exit 1
else
  echo "✅ All CI jobs passed or were skipped!"
  exit 0
fi