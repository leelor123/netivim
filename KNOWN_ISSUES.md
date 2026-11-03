# Known issues

All must be closed before the M2 release (DoD: this file empty).

1. Living Map: place labels overlap in the dense central cluster at the default camera (needs label collision avoidance). Owner: timeline.
4. Living Map relief control points (GEO-001..004) are approximate and Ch2 timeline events still cite unreviewed C2- research IDs; verify before Ch2 ships. Owner: fact-checker.
5. Living Map line layers (1947 partition, 1949 armistice) are empty pending precisely sourced coordinates. Owner: research.
6. World figures cast shadows in the static pose; road contrast could be higher. Owner: world (polish).
7. Local E2E is unreliable while several agents run browsers at once (CPU-starved WebGL slows the fixed-step clock); CI is the gate. Owner: lead (consider a test-only fast-forward hook).
8. Adaptive quality lowered the preset right at launch in a slow (software GL) browser and its toast overlaps the title menu; add a grace period after launch and scene switches, and keep toasts clear of menus. Owner: graphics/UI.
10. Timeline chapter names wrap or truncate at phone width (e.g. Ch8). Owner: timeline.
