#!/usr/bin/env bash
set -Eeuo pipefail

executable="$1"
project="$2"
driver="$3"
stub="$4"
phase_file="${XDG_DATA_HOME}/journey-phases.json"
failure_file="${CODEREADER_JOURNEY_FAILURE_FILE:?missing controlled failure envelope path}"
current_phase="fixture-0.10"
failure_helper="$(cd "$(dirname "$0")" && pwd)/native-journey-linux-failure.sh"
source "$failure_helper"
install_native_journey_failure_trap
rm -f "$failure_file"

run_timed_app() {
  if test -n "${CODEREADER_JOURNEY_TIMEOUT_SELFTEST_EXIT:-}"; then
    if timeout 20s bash -c "exit ${CODEREADER_JOURNEY_TIMEOUT_SELFTEST_EXIT}"; then
      local code=0
    else
      local code=$?
    fi
  else
    if timeout 20s dbus-run-session -- xvfb-run -a "$executable" >/tmp/codereader-migrate.log 2>&1; then
      local code=0
    else
      local code=$?
    fi
  fi
  app_exit="$code"
  if test "$code" -ne 0 && test "$code" -ne 124; then fail_native_journey launch-failed "$code"; fi
}

if test -n "${CODEREADER_JOURNEY_FAILURE_SELFTEST_PHASE:-}"; then
  case "$CODEREADER_JOURNEY_FAILURE_SELFTEST_PHASE" in
    fixture-0.10|fixture-0.11-current|fixture-0.11-early|migration-recovery)
      current_phase="$CODEREADER_JOURNEY_FAILURE_SELFTEST_PHASE"
      if test -n "${CODEREADER_JOURNEY_FAILURE_SELFTEST_CATEGORY:-}"; then
        fail_native_journey "$CODEREADER_JOURNEY_FAILURE_SELFTEST_CATEGORY" "${CODEREADER_JOURNEY_FAILURE_SELFTEST_EXIT:-7}"
      else
        (exit "${CODEREADER_JOURNEY_FAILURE_SELFTEST_EXIT:-7}")
      fi
      ;;
    ui-first-run|ui-restart-restore|phase-merge)
      current_phase="ui-session"
      bash -Eeuo pipefail -c '
        source "$1"; failure_file="$2"; current_phase="$3"; install_native_journey_failure_trap
        (exit "$4")
      ' bash "$failure_helper" "$failure_file" "$CODEREADER_JOURNEY_FAILURE_SELFTEST_PHASE" "${CODEREADER_JOURNEY_FAILURE_SELFTEST_EXIT:-7}"
      ;;
    success)
      rm -f "$failure_file"
      trap - ERR
      exit 0
      ;;
    timeout-nonzero)
      CODEREADER_JOURNEY_TIMEOUT_SELFTEST_EXIT=37
      run_timed_app
      ;;
    timeout-accepted)
      CODEREADER_JOURNEY_TIMEOUT_SELFTEST_EXIT=124
      run_timed_app
      rm -f "$failure_file"
      trap - ERR
      exit 0
      ;;
    backup-probe)
      ;;
    *)
      printf '{"phase":"../../private","category":"stderr:/secret","exit":"bad"}\n' > "$failure_file"
      current_phase="ui-session"
      (exit 8)
      ;;
  esac
fi

merge_phase() {
  local name="$1" probe="$2"
  python3 - "$phase_file" "$name" "$probe" <<'PY'
import json, os, sys
path, name, probe = sys.argv[1:]
phases = {}
if os.path.exists(path):
    with open(path, encoding="utf-8") as source:
        phases = json.load(source)
if name in phases:
    raise SystemExit(f"duplicate phase: {name}")
phases[name] = {"status": "pass", "probe": probe}
with open(path, "w", encoding="utf-8") as output:
    json.dump(phases, output)
PY
}

capture_backup() {
  local pattern="$1" matches code
  if matches="$(compgen -G "$pattern")"; then
    backup="${matches%%$'\n'*}"
    if test -z "$backup"; then fail_native_journey backup-missing 1; fi
  else
    code=$?
    if test "$code" -eq 1; then fail_native_journey backup-missing 1; fi
    fail_native_journey command-failed "$code"
  fi
}

if test "${CODEREADER_JOURNEY_FAILURE_SELFTEST_PHASE:-}" = backup-probe; then
  current_phase="fixture-0.10"
  capture_backup "${XDG_DATA_HOME}/missing-backup-*"
fi

probe_fixture() {
  local fixture="$1" label="$2" prompt="$3" phase_name="$4"
  rm -rf "${XDG_DATA_HOME}/com.codereader.desktop" "${XDG_DATA_HOME}/com.codereader.app"
  mkdir -p "${XDG_DATA_HOME}/com.codereader.app"
  cp "$fixture" "${XDG_DATA_HOME}/com.codereader.app/codereader.sqlite"
  local original_hash original_version
  original_hash="$(sha256sum "$fixture" | cut -d' ' -f1)"
  original_version="$(sqlite3 "$fixture" 'PRAGMA user_version;')"
  run_timed_app
  local current="${XDG_DATA_HOME}/com.codereader.desktop/codereader.sqlite"
  if test ! -f "$current"; then
    if test "$app_exit" -eq 124; then fail_native_journey timeout 124; fi
    fail_native_journey database-not-created 1
  fi
  test "$(sqlite3 "$current" 'PRAGMA user_version;')" = 6 || fail_native_journey schema-invalid 1
  test "$(sqlite3 "$current" 'PRAGMA integrity_check;')" = ok || fail_native_journey schema-invalid 1
  for query in \
    "SELECT count(*) FROM projects WHERE id='project:fixture';" \
    "SELECT count(*) FROM explanation_nodes WHERE id='exp:fixture';" \
    "SELECT count(*) FROM user_reading_states WHERE id='reading:fixture';" \
    "SELECT count(*) FROM model_provider_settings WHERE id='default';"; do
    test "$(sqlite3 "$current" "$query")" = 1 || fail_native_journey data-missing 1
  done
  if test -n "$prompt"; then
    test "$(sqlite3 "$current" "SELECT count(*) FROM prompt_versions WHERE version='$prompt';")" = 1 || fail_native_journey data-missing 1
  fi
  local backup
  capture_backup "${XDG_DATA_HOME}/com.codereader.app/codereader.sqlite.backup-*"
  test "$(sqlite3 "$backup" 'PRAGMA user_version;')" = "$original_version" || fail_native_journey schema-invalid 1
  test "$(sha256sum "$backup" | cut -d' ' -f1)" = "$original_hash" || fail_native_journey data-missing 1
  if test -n "$phase_name"; then merge_phase "$phase_name" "schema/content/integrity plus exact original backup verified"; fi
}

probe_fixture "$CODEREADER_JOURNEY_FIXTURE_010" 010 "" legacy-0.10-upgrade
current_phase="fixture-0.11-current"
probe_fixture "$CODEREADER_JOURNEY_FIXTURE_011_CURRENT" 011-current current-canary ""
current_phase="fixture-0.11-early"
probe_fixture "$CODEREADER_JOURNEY_FIXTURE_011" 011-early legacy-canary ""

# A deliberately damaged copy must enter non-destructive recovery: the legacy
# source remains byte-identical and the attempted current database cannot
# silently become a fresh empty database.
current_phase="migration-recovery"
failure_fixture="${XDG_DATA_HOME}/failure-v011.sqlite"
cp "$CODEREADER_JOURNEY_FIXTURE_011" "$failure_fixture"
# Force migration verification failure while retaining every legacy table and
# row, so the verified backup is a complete recovery source.
sqlite3 "$failure_fixture" 'PRAGMA user_version=999;'
failure_hash="$(sha256sum "$failure_fixture" | cut -d' ' -f1)"
rm -rf "${XDG_DATA_HOME}/com.codereader.desktop" "${XDG_DATA_HOME}/com.codereader.app"
mkdir -p "${XDG_DATA_HOME}/com.codereader.app"
cp "$failure_fixture" "${XDG_DATA_HOME}/com.codereader.app/codereader.sqlite"
run_timed_app
test "$(sha256sum "${XDG_DATA_HOME}/com.codereader.app/codereader.sqlite" | cut -d' ' -f1)" = "$failure_hash"
current="${XDG_DATA_HOME}/com.codereader.desktop/codereader.sqlite"
recovery_backup="$(compgen -G "${XDG_DATA_HOME}/com.codereader.app/codereader.sqlite.backup-*" | head -1)"
test -n "$recovery_backup"
test "$(sha256sum "$recovery_backup" | cut -d' ' -f1)" = "$failure_hash"
# Restore the complete verified backup, reset only its deliberately unsupported
# version marker, and launch the product to execute the real migration again.
cp "$recovery_backup" "${XDG_DATA_HOME}/com.codereader.app/codereader.sqlite"
sqlite3 "${XDG_DATA_HOME}/com.codereader.app/codereader.sqlite" 'PRAGMA user_version=2;'
rm -rf "${XDG_DATA_HOME}/com.codereader.desktop"
run_timed_app
current="${XDG_DATA_HOME}/com.codereader.desktop/codereader.sqlite"
test "$(sqlite3 "$current" 'PRAGMA integrity_check;')" = ok
for query in \
  "SELECT count(*) FROM explanation_nodes WHERE id='exp:fixture';" \
  "SELECT count(*) FROM user_reading_states WHERE id='reading:fixture';" \
  "SELECT count(*) FROM prompt_versions WHERE version='legacy-canary';" \
  "SELECT count(*) FROM model_provider_settings WHERE id='default';"; do
  test "$(sqlite3 "$current" "$query")" = 1
done
merge_phase legacy-0.11-upgrade "early/current migrations plus failed-migration verified-backup restore and relaunch preserved explanation, cognition, prompt and model settings"
rm -rf "${XDG_DATA_HOME}/com.codereader.desktop" "${XDG_DATA_HOME}/com.codereader.app"

current_phase="ui-session"
dbus-run-session -- xvfb-run -a -s '-screen 0 1280x720x24' bash -Eeuo pipefail -c '
  executable="$1"; project="$2"; driver="$3"; stub="$4"; phase_file="$5"; wrong_project="$6"; failure_file="$7"; failure_helper="$8"
  current_phase="ui-first-run"
  source "$failure_helper"
  install_native_journey_failure_trap
  node "$stub" 18765 >/tmp/codereader-native-journey-stub.log 2>&1 &
  stub_pid=$!
  "$executable" >/tmp/codereader-native-journey.log 2>&1 &
  pid=$!
  trap '\''kill "$pid" "$stub_pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true'\'' EXIT
  python3 "$driver" "$project" "http://127.0.0.1:18765/v1/chat/completions" "$phase_file.ui"
  import -window root "$XDG_DATA_HOME/native-journey-200-percent.png"
  kill "$pid"; wait "$pid" || true
  current_phase="ui-restart-restore"
  "$executable" >/tmp/codereader-native-journey-restart.log 2>&1 &
  pid=$!
  python3 "$driver" --verify-restore "$wrong_project" "$project"
  database="$XDG_DATA_HOME/com.codereader.desktop/codereader.sqlite"
  test "$(sqlite3 "$database" "SELECT root_path FROM projects ORDER BY updated_at DESC LIMIT 1;")" = "$(realpath "$project")"
  test "$(sqlite3 "$database" "SELECT count(*) FROM explanation_nodes WHERE code_level_meaning='The selected function validates input and returns a stable result.';")" -ge 1
  current_phase="phase-merge"
  python3 - "$phase_file" "$phase_file.ui" <<'\''PY'\''
import json, sys
with open(sys.argv[1], encoding="utf-8") as source:
    phases = json.load(source)
with open(sys.argv[2], encoding="utf-8") as source:
    ui = json.load(source)
for name, result in ui.items():
    if name in phases:
        raise SystemExit(f"duplicate phase: {name}")
    phases[name] = result
phases["restart-reauthorize-restore"] = {
    "status": "pass",
    "probe": "second process reopened native picker, reauthorized the same controlled directory, confirmed project identity, README and persisted explanation through AT-SPI"
}
with open(sys.argv[1], "w", encoding="utf-8") as output:
    json.dump(phases, output)
PY
' bash "$executable" "$project" "$driver" "$stub" "$phase_file" "$CODEREADER_JOURNEY_WRONG_PROJECT" "$failure_file" "$failure_helper"
trap - ERR
rm -f "$failure_file"
