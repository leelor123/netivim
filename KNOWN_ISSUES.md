# Known issues

All must be closed before the M2 release (DoD: this file empty).

1. Living Map: place labels overlap in the dense central cluster at the default camera (needs label collision avoidance). Owner: timeline.
2. src/world/quality.ts PRESET_QUALITY is provisional; switch to the Graphics PRESETS table once merged. Owner: lead at Graphics merge.
3. disposeObject does not dispose lights, so directional-light shadow maps may stay allocated after a scene switch. Owner: graphics.
4. eras.ts and Living Map cite some Wikipedia-as-index [W] sources and approximate relief control points (GEO-001..004); upgrade to opened sources before release. Owner: fact-checker.
5. Living Map line layers (1947 partition, 1949 armistice) are empty pending precisely sourced coordinates. Owner: research.
6. World figures cast shadows in the static pose; road contrast could be higher. Owner: world (polish).
7. Local E2E is unreliable while several agents run browsers at once (CPU-starved WebGL slows the fixed-step clock); CI is the gate. Owner: lead (consider a test-only fast-forward hook).
