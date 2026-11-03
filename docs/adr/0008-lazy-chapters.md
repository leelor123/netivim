# ADR 0008: Lazy-loaded chapters behind a loading screen

Status: accepted (2026-11-03)

Decision: Each chapter (content and level builders) is a dynamic import chunk under
src/content/chNN/ and src/levels/chNN/. A loading screen shows progress and a sourced tip.
Leaving a chapter disposes its scene graph, geometries, materials and textures.

Consequences: initial JS stays small; memory stays flat across chapters (checked by soak test).
