# Netivim

A 3D narrative-educational game (Hebrew) about the history of Israel's wars and pivotal defense
events, from the pre-state era to today. Players never aim at or harm people: the game is about
discovery, planning, rescue and understanding history from more than one perspective.

Status: early development (M0). See PROGRESS.md.

## Install on Android
Download netivim.apk from the latest release:
https://github.com/leelor123/netivim/releases/latest/download/netivim.apk

## Develop
    npm ci
    npm run dev      # local dev server
    npm run check    # lint + typecheck + tests + build

Releases are built and signed by GitHub Actions when a v* tag is pushed.

## Principles
- Fully offline. No analytics, trackers or network calls.
- Every historical claim cites a source in SOURCES.md and is labeled as documented,
  reconstructed or a fictional composite.

## License
Code: MIT (see LICENSE).
