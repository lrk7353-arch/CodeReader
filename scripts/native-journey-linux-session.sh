#!/usr/bin/env bash
set -euo pipefail

executable="$1"
project="$2"
driver="$3"
stub="$4"
phase_file="${XDG_DATA_HOME}/journey-phases.json"

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

probe_fixture() {
  local fixture="$1" label="$2" prompt="$3" phase_name="$4"
  rm -rf "${XDG_DATA_HOME}/com.codereader.desktop" "${XDG_DATA_HOME}/com.codereader.app"
  mkdir -p "${XDG_DATA_HOME}/com.codereader.app"
  cp "$fixture" "${XDG_DATA_HOME}/com.codereader.app/codereader.sqlite"
  local original_hash original_version
  original_hash="$(sha256sum "$fixture" | cut -d' ' -f1)"
  original_version="$(sqlite3 "$fixture" 'PRAGMA user_version;')"
  timeout 20s dbus-run-session -- xvfb-run -a "$executable" >/tmp/codereader-migrate.log 2>&1 || test "$?" = 124
  local current="${XDG_DATA_HOME}/com.codereader.desktop/codereader.sqlite"
  test "$(sqlite3 "$current" 'PRAGMA user_version;')" = 6
  test "$(sqlite3 "$current" 'PRAGMA integrity_check;')" = ok
  for query in \
    "SELECT count(*) FROM projects WHERE id='project:fixture';" \
    "SELECT count(*) FROM explanation_nodes WHERE id='exp:fixture';" \
    "SELECT count(*) FROM user_reading_states WHERE id='reading:fixture';" \
    "SELECT count(*) FROM model_provider_settings WHERE id='default';"; do
    test "$(sqlite3 "$current" "$query")" = 1
  done
  if test -n "$prompt"; then
    test "$(sqlite3 "$current" "SELECT count(*) FROM prompt_versions WHERE version='$prompt';")" = 1
  fi
  local backup
  backup="$(compgen -G "${XDG_DATA_HOME}/com.codereader.app/codereader.sqlite.backup-*" | head -1)"
  test -n "$backup"
  test "$(sqlite3 "$backup" 'PRAGMA user_version;')" = "$original_version"
  test "$(sha256sum "$backup" | cut -d' ' -f1)" = "$original_hash"
  if test -n "$phase_name"; then merge_phase "$phase_name" "schema/content/integrity plus exact original backup verified"; fi
}

probe_fixture "$CODEREADER_JOURNEY_FIXTURE_010" 010 "" legacy-0.10-upgrade
probe_fixture "$CODEREADER_JOURNEY_FIXTURE_011_CURRENT" 011-current current-canary ""
probe_fixture "$CODEREADER_JOURNEY_FIXTURE_011" 011-early legacy-canary ""

# A deliberately damaged copy must enter non-destructive recovery: the legacy
# source remains byte-identical and the attempted current database cannot
# silently become a fresh empty database.
failure_fixture="${XDG_DATA_HOME}/failure-v011.sqlite"
cp "$CODEREADER_JOURNEY_FIXTURE_011" "$failure_fixture"
# Force migration verification failure while retaining every legacy table and
# row, so the verified backup is a complete recovery source.
sqlite3 "$failure_fixture" 'PRAGMA user_version=999;'
failure_hash="$(sha256sum "$failure_fixture" | cut -d' ' -f1)"
rm -rf "${XDG_DATA_HOME}/com.codereader.desktop" "${XDG_DATA_HOME}/com.codereader.app"
mkdir -p "${XDG_DATA_HOME}/com.codereader.app"
cp "$failure_fixture" "${XDG_DATA_HOME}/com.codereader.app/codereader.sqlite"
timeout 20s dbus-run-session -- xvfb-run -a "$executable" >/tmp/codereader-failed-migrate.log 2>&1 || test "$?" = 124
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
timeout 20s dbus-run-session -- xvfb-run -a "$executable" >/tmp/codereader-recovered-migrate.log 2>&1 || test "$?" = 124
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

dbus-run-session -- xvfb-run -a -s '-screen 0 1280x720x24' bash -euo pipefail -c '
  executable="$1"; project="$2"; driver="$3"; stub="$4"; phase_file="$5"; wrong_project="$6"
  node "$stub" 18765 >/tmp/codereader-native-journey-stub.log 2>&1 &
  stub_pid=$!
  "$executable" >/tmp/codereader-native-journey.log 2>&1 &
  pid=$!
  trap '\''kill "$pid" "$stub_pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true'\'' EXIT
  python3 "$driver" "$project" "http://127.0.0.1:18765/v1/chat/completions" "$phase_file.ui"
  import -window root "$XDG_DATA_HOME/native-journey-200-percent.png"
  kill "$pid"; wait "$pid" || true
  "$executable" >/tmp/codereader-native-journey-restart.log 2>&1 &
  pid=$!
  python3 "$driver" --verify-restore "$wrong_project" "$project"
  database="$XDG_DATA_HOME/com.codereader.desktop/codereader.sqlite"
  test "$(sqlite3 "$database" "SELECT root_path FROM projects ORDER BY updated_at DESC LIMIT 1;")" = "$(realpath "$project")"
  test "$(sqlite3 "$database" "SELECT count(*) FROM explanation_nodes WHERE code_level_meaning='The selected function validates input and returns a stable result.';")" -ge 1
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
' bash "$executable" "$project" "$driver" "$stub" "$phase_file" "$CODEREADER_JOURNEY_WRONG_PROJECT"
