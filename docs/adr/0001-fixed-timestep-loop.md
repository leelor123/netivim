# ADR 0001: Fixed-timestep simulation separate from rendering

Status: accepted (2026-11-03)

Context: Missions need deterministic timers, solvability tests and identical behavior at 30, 60
or 120 Hz displays. Rendering speed varies by preset and device.

Decision: renderer.setAnimationLoop drives frames; THREE.Timer measures time. A GameLoop runs
simulation in fixed steps of 1/60 s using an accumulator, at most 5 steps per frame (excess
time is dropped to avoid a spiral of death), then renders with interpolation alpha. Pause and
backgrounding stop simulation steps; Timer.connect(document) resets delta on visibility return.
The loop core is pure (no three.js) so it is unit-testable with a fake clock.

Consequences: game logic is deterministic and testable headless; the QA bot can run missions
faster than real time by stepping the simulation directly.
