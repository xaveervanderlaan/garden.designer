#!/usr/bin/env bash
# Quiet full check: one line per step, logs in .verify/<step>.log, tail of the log on failure.
# Usage: npm run verify [-- step ...]   (steps: lint typecheck unit build e2e)
set -uo pipefail
cd "$(dirname "$0")/.."
mkdir -p .verify

declare -A CMD=(
  [lint]='npm run lint'
  [typecheck]='npm run typecheck'
  [unit]='npx vitest run --reporter=dot'
  [build]='npm run build'
  [e2e]='E2E_SKIP_BUILD=1 npx playwright test --reporter=line'
)
ALL=(lint typecheck unit build e2e)
STEPS=("$@")
[ ${#STEPS[@]} -eq 0 ] && STEPS=("${ALL[@]}")

for step in "${STEPS[@]}"; do
  if [ -z "${CMD[$step]:-}" ]; then
    echo "Unknown step: $step (use: ${ALL[*]})" >&2
    exit 2
  fi
done

for step in "${STEPS[@]}"; do
  start=$SECONDS
  if bash -c "${CMD[$step]}" >".verify/$step.log" 2>&1; then
    printf '✓ %-9s %ss\n' "$step" "$((SECONDS - start))"
  else
    printf '✗ %-9s %ss\n' "$step" "$((SECONDS - start))"
    tail -n 40 ".verify/$step.log"
    exit 1
  fi
done
