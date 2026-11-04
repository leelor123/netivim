# Known issues

All must be closed before the M2 release (DoD: this file empty).

4. Living Map relief control points (GEO-001..004) are approximate and Ch2 timeline events still cite unreviewed C2- research IDs; verify before Ch2 ships. Owner: fact-checker.
5. Living Map line layers (1947 partition, 1949 armistice) are empty pending precisely sourced coordinates. Owner: research.
7. Local E2E is unreliable while several agents run browsers at once (CPU-starved WebGL slows the fixed-step clock); CI is the gate. Owner: lead (consider a test-only fast-forward hook).
15. Ch2 (1948) Living Map captions: the Rabin paraphrase (Lod/Ramle) and Morris 50,000 figure are cited via secondary pages (C2-112, Shavit), not the books; Negba and Kfar Etzion captions have no Palestinian-lens counterpart. Upgrade before Ch2 is built. Owner: Ch2 historian.
16. Living Map label collision is too aggressive (about 3 of 10 labels visible at the default Medium view; widths are estimated at 8 px per character): measure real text widths and try small offsets before hiding. Owner: timeline.
