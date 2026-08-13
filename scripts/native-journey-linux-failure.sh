#!/usr/bin/env bash

write_native_journey_failure() {
  local failure_file="$1" phase="$2" exit_code="$3" category="${4:-command-failed}"
  python3 - "$failure_file" "$phase" "$exit_code" "$category" <<'PY'
import json, os, sys
path, phase, exit_code, category = sys.argv[1:]
allowed_phases = {"fixture-0.10", "fixture-0.11-current", "fixture-0.11-early", "migration-recovery", "ui-session", "ui-first-run", "ui-restart-restore", "phase-merge"}
allowed_categories = {"command-failed", "launch-failed", "timeout", "database-not-created", "schema-invalid", "data-missing", "backup-missing"}
fixture_phases = {"fixture-0.10", "fixture-0.11-current", "fixture-0.11-early", "migration-recovery"}
def valid_pair(candidate_phase, candidate_category):
    return candidate_category == "command-failed" or (candidate_phase in fixture_phases and candidate_category in allowed_categories)
try:
    with open(path, encoding="utf-8") as source:
        existing = json.load(source)
    if set(existing) == {"phase", "category", "exit"} and existing["phase"] in allowed_phases and valid_pair(existing["phase"], existing["category"]) and isinstance(existing["exit"], int) and not isinstance(existing["exit"], bool) and 1 <= existing["exit"] <= 255:
        raise SystemExit(0)
except (FileNotFoundError, OSError, ValueError, TypeError, json.JSONDecodeError):
    pass
temporary = path + ".tmp"
with open(temporary, "w", encoding="utf-8") as output:
    if not valid_pair(phase, category):
        category = "command-failed"
    json.dump({"phase": phase, "category": category, "exit": int(exit_code)}, output)
os.replace(temporary, path)
PY
}

fail_native_journey() {
  local category="$1" exit_code="${2:-1}"
  trap - ERR
  write_native_journey_failure "$failure_file" "$current_phase" "$exit_code" "$category"
  exit "$exit_code"
}

install_native_journey_failure_trap() {
  trap 'code=$?; trap - ERR; write_native_journey_failure "$failure_file" "$current_phase" "$code"; exit "$code"' ERR
}
