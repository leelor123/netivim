# ADR 0003: Atomic double-buffered saves across several backends

Status: accepted (2026-11-03)

Decision: Each slot has buffers A and B plus a pointer key. A save serializes the payload,
computes a checksum (FNV-1a 32 over the JSON text), writes an envelope (version, seq, savedAt,
checksum, payload) to the inactive buffer, then flips the pointer. Load validates both buffers
and takes the valid one with the highest seq. Envelopes over 512 KB are refused. Backends
implement a tiny sync-or-async KeyValueStore interface: localStorage (sync, used on exit
events), IndexedDB mirror, Capacitor Preferences on Android. The newest valid envelope across
backends wins. Migrations run step by step from the stored version to the current one.

Consequences: a kill mid-write never corrupts the last good save; clearing WebView storage on
Android does not lose progress because Preferences survives it.
