# Known issues

All must be closed before the M2 release (DoD: this file empty).

1. Living Map: place labels overlap in the dense central cluster at the default camera (needs label collision avoidance). Owner: timeline.
4. eras.ts and Living Map cite some Wikipedia-as-index [W] sources and approximate relief control points (GEO-001..004); upgrade to opened sources before release. Owner: fact-checker.
5. Living Map line layers (1947 partition, 1949 armistice) are empty pending precisely sourced coordinates. Owner: research.
6. World figures cast shadows in the static pose; road contrast could be higher. Owner: world (polish).
7. Local E2E is unreliable while several agents run browsers at once (CPU-starved WebGL slows the fixed-step clock); CI is the gate. Owner: lead (consider a test-only fast-forward hook).
8. Adaptive quality lowered the preset right at launch in a slow (software GL) browser and its toast overlaps the title menu; add a grace period after launch and scene switches, and keep toasts clear of menus. Owner: graphics/UI.
9. eras.ts cites C1-003, C1-010, C1-011, C1-012, C1-015, C1-017, C1-046, C1-049, C1-050 which are missing from SOURCES.md. Owner: content reviewer (running).
10. Timeline chapter names wrap or truncate at phone width (e.g. Ch8). Owner: timeline.
