# Android smoke test

CI runs `android/ci/smoke-test.sh` on an API 34 x86_64 `google_apis` emulator after the signed APK is
built (job `smoke` in `.github/workflows/android.yml`). Tag releases wait for it.

## What it checks

1. APK installs, launches, process alive, WebView renderer process running.
2. No `FATAL EXCEPTION` or ANR for `io.github.leelor123.netivim` in logcat.
3. Landscape: screenshot width is greater than height.
4. Immersive: `dumpsys window` InsetsSource entries for status and navigation bars are not `visible=true`.
5. HOME, then relaunch: same pid (state kept), still resumed, still landscape and immersive.
6. BACK once: process alive and `MainActivity` still the resumed activity (Back opens the pause menu).

Screenshots (`launch.png`, `resumed.png`, `after-back.png`), `logcat.txt` and on failure `dumpsys-*.txt` and
`failure.png` are in the `smoke-test-<version>` workflow artifact.

## Run it locally

Needs the Android SDK, an x86_64 API 34 AVD and an APK (download the release or CI artifact `netivim.apk`).

```bash
emulator -avd Pixel_6_API_34 -no-snapshot & adb wait-for-device && bash android/ci/smoke-test.sh netivim.apk smoke-out
```

Output goes to `smoke-out/`. Exit code 0 means every check passed. A physical phone also works
(`adb devices` must list exactly one device); the script uninstalls any existing copy first, so saves on that
device are wiped.
