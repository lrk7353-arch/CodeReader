#!/usr/bin/env bash
set -euo pipefail

executable="$1"
shift || true
"$executable" "$@" >/dev/null 2>&1 &
pid=$!
cleanup() {
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}
trap cleanup EXIT

for _ in $(seq 1 30); do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "CodeReader exited before opening a window." >&2
    exit 1
  fi
  if xdotool search --onlyvisible --pid "$pid" --name 'CodeReader' >/dev/null 2>&1; then
    exit 0
  fi
  sleep 1
done

echo "CodeReader did not expose a visible window within 30 seconds." >&2
exit 1
