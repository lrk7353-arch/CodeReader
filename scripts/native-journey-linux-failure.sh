#!/usr/bin/env bash

write_native_journey_failure() {
  local failure_file="$1" phase="$2" exit_code="$3"
  python3 - "$failure_file" "$phase" "$exit_code" <<'PY'
import json, os, sys
path, phase, exit_code = sys.argv[1:]
allowed_phases = {"fixture-0.10", "fixture-0.11-current", "fixture-0.11-early", "migration-recovery", "ui-session", "ui-first-run", "ui-restart-restore", "phase-merge"}
try:
    with open(path, encoding="utf-8") as source:
        existing = json.load(source)
    if set(existing) == {"phase", "category", "exit"} and existing["phase"] in allowed_phases and existing["category"] == "command-failed" and isinstance(existing["exit"], int) and not isinstance(existing["exit"], bool) and 1 <= existing["exit"] <= 255:
        raise SystemExit(0)
except (FileNotFoundError, OSError, ValueError, TypeError, json.JSONDecodeError):
    pass
temporary = path + ".tmp"
with open(temporary, "w", encoding="utf-8") as output:
    json.dump({"phase": phase, "category": "command-failed", "exit": int(exit_code)}, output)
os.replace(temporary, path)
PY
}

install_native_journey_failure_trap() {
  trap 'code=$?; trap - ERR; write_native_journey_failure "$failure_file" "$current_phase" "$code"; exit "$code"' ERR
}
