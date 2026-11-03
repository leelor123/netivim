#!/usr/bin/env bash
# Android emulator smoke test for the signed Netivim APK.
#
# Usage:  bash android/ci/smoke-test.sh path/to/netivim.apk [output-dir]
# Needs:  a running emulator or device visible to `adb` (API 30+; CI uses API 34).
#
# Asserts (each prints "PASS" or fails with a readable "FAIL" block):
#   1. APK installs and launches; process is alive; WebView renderer exists
#   2. No "FATAL EXCEPTION" / ANR for our package
#   3. Display is landscape (screenshot width > height)
#   4. Immersive: status and navigation bars are not visible (InsetsSource check)
#   5. HOME then relaunch: same process (state kept), still resumed, bars still hidden
#   6. BACK once: app is NOT exited, our activity is still on top (Back = pause menu)
# Artifacts (screenshots, logcat, window dumps) go to the output dir.
set -u

APK="${1:?usage: smoke-test.sh path/to/netivim.apk [output-dir]}"
OUT="${2:-smoke-out}"
PKG="io.github.leelor123.netivim"
ACT="$PKG/.MainActivity"
mkdir -p "$OUT"

step() { echo; echo "=== $* ==="; }
pass() { echo "PASS: $*"; }

# Dump everything useful, then fail loudly.
fail() {
  echo
  echo "::error title=Android smoke test failed::$*"
  echo "FAIL: $*"
  adb logcat -d -v threadtime >"$OUT/logcat.txt" 2>&1 || true
  adb shell dumpsys window >"$OUT/dumpsys-window.txt" 2>&1 || true
  adb shell dumpsys activity activities >"$OUT/dumpsys-activities.txt" 2>&1 || true
  adb exec-out screencap -p >"$OUT/failure.png" 2>/dev/null || true
  echo "--- last 40 logcat lines for $PKG ---"
  grep -E "$PKG|AndroidRuntime|chromium|Capacitor" "$OUT/logcat.txt" | tail -40
  exit 1
}

app_pid() { adb shell pidof "$PKG" 2>/dev/null | tr -d '\r' | awk '{print $1}'; }
app_pid_up() { [ -n "$(app_pid)" ]; }

# Poll a shell function until it succeeds, max $1 seconds.
wait_for() {
  local limit="$1"; shift
  local i=0
  while [ "$i" -lt "$limit" ]; do
    if "$@"; then return 0; fi
    sleep 1; i=$((i + 1))
  done
  return 1
}

top_is_app() {
  adb shell dumpsys activity activities | tr -d '\r' \
    | grep -E "topResumedActivity|mResumedActivity|ResumedActivity" | grep -q "$PKG"
}

webview_renderer_up() {
  # Chromium renderer processes show up as "...:sandboxed_process0:..." for any WebView provider.
  adb shell ps -A 2>/dev/null | tr -d '\r' | grep -q "sandboxed_process"
}

# Screenshot to $1.png and echo "WxH" read from the PNG IHDR (rotation-aware).
shot() {
  adb exec-out screencap -p >"$OUT/$1.png" || fail "screencap failed ($1)"
  local w h
  w=$(od -An -j16 -N4 -tu1 "$OUT/$1.png" | awk '{print $1*16777216+$2*65536+$3*256+$4}')
  h=$(od -An -j20 -N4 -tu1 "$OUT/$1.png" | awk '{print $1*16777216+$2*65536+$3*256+$4}')
  echo "${w}x${h}"
}

is_landscape() {
  local size w h
  size=$(shot "$1")
  w=${size%x*}; h=${size#*x}
  echo "screen $size"
  [ "$w" -gt "$h" ]
}

# Visible system bars according to the window manager. Prints offending lines.
# API 33+: "InsetsSource ... type=statusBars ... visible=true"; API 30-32: "type=ITYPE_STATUS_BAR".
bars_visible_lines() {
  adb shell dumpsys window | tr -d '\r' \
    | grep -E "type=(statusBars|navigationBars|ITYPE_STATUS_BAR|ITYPE_NAVIGATION_BAR)" \
    | grep -E "visible=true"
}
bars_known() {
  adb shell dumpsys window | tr -d '\r' \
    | grep -E "type=(statusBars|navigationBars|ITYPE_STATUS_BAR|ITYPE_NAVIGATION_BAR)" \
    | grep -qE "visible=(true|false)"
}
bars_hidden() { bars_known && ! bars_visible_lines >/dev/null; }

assert_immersive() {
  bars_known || fail "$1: dumpsys window has no InsetsSource lines for system bars (parser needs updating; see dumpsys-window.txt)"
  # Android may take a moment to apply hide() after a window gains focus.
  wait_for 15 bars_hidden || {
    echo "Bars still reported visible:"; bars_visible_lines
    fail "$1: system bars are visible; app is not immersive"
  }
  pass "$1: status and navigation bars hidden (immersive)"
}

assert_no_crash() {
  adb logcat -d -v threadtime >"$OUT/logcat.txt" 2>&1
  if grep -A4 "FATAL EXCEPTION" "$OUT/logcat.txt" | grep -q "Process: $PKG"; then
    grep -B1 -A12 "FATAL EXCEPTION" "$OUT/logcat.txt" | head -40
    fail "$1: FATAL EXCEPTION in $PKG"
  fi
  if grep -q "ANR in $PKG" "$OUT/logcat.txt"; then fail "$1: ANR in $PKG"; fi
  pass "$1: no FATAL EXCEPTION / ANR for $PKG"
}

assert_alive() {
  local pid; pid=$(app_pid)
  [ -n "$pid" ] || fail "$1: app process is not running"
  pass "$1: process alive (pid $pid)"
}

# ---------------------------------------------------------------------------
step "Prepare device"
adb wait-for-device
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard >/dev/null 2>&1 || true
adb shell settings put system accelerometer_rotation 1 >/dev/null 2>&1 || true
adb shell getprop ro.build.version.sdk | tr -d '\r' | sed 's/^/API level: /'
adb uninstall "$PKG" >/dev/null 2>&1 || true
adb logcat -c

step "1. Install and launch"
adb install -r "$APK" || fail "adb install failed"
adb shell am start -W -n "$ACT" | tee "$OUT/am-start.txt"
grep -q "Status: ok" "$OUT/am-start.txt" || fail "am start did not report Status: ok"
wait_for 20 app_pid_up || fail "app process did not appear"
wait_for 60 webview_renderer_up || fail "WebView renderer process never started (WebView did not load)"
pass "WebView renderer running"
wait_for 30 top_is_app || fail "MainActivity is not the resumed activity"
sleep 8 # let the page boot and the first frames render
assert_alive "after launch"
assert_no_crash "after launch"

step "2. Landscape"
wait_for 20 is_landscape launch || fail "display is not landscape (see launch.png)"
pass "landscape"

step "3. Immersive"
assert_immersive "after launch"
shot launch >/dev/null

step "4. Background and return (HOME, relaunch)"
PID_BEFORE=$(app_pid)
adb shell input keyevent KEYCODE_HOME
sleep 3
assert_alive "while in background"
adb shell am start -W -n "$ACT" >/dev/null
wait_for 20 top_is_app || fail "app not resumed after relaunch"
sleep 3
PID_AFTER=$(app_pid)
[ "$PID_BEFORE" = "$PID_AFTER" ] || fail "process restarted on resume (pid $PID_BEFORE -> $PID_AFTER); in-memory state was lost"
pass "same process after resume (pid $PID_AFTER)"
assert_no_crash "after resume"
wait_for 20 is_landscape resumed >/dev/null || fail "not landscape after resume"
assert_immersive "after resume"
shot resumed >/dev/null

step "5. BACK must not exit the app"
adb shell input keyevent KEYCODE_BACK
sleep 3
assert_alive "after BACK"
top_is_app || fail "after BACK: MainActivity is no longer on top (Back must open the pause menu, never exit or background)"
pass "after BACK: MainActivity still on top"
assert_no_crash "after BACK"
shot after-back >/dev/null

adb logcat -d -v threadtime >"$OUT/logcat.txt" 2>&1 || true
echo
echo "ALL SMOKE CHECKS PASSED"
