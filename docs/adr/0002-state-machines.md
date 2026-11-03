# ADR 0002: Explicit state machines for game flow and missions

Status: accepted (2026-11-03)

Decision: A small typed FSM library (src/core/fsm.ts) with declared states, events and guarded
transitions. Undeclared transitions throw in tests and are ignored plus logged in production.
The game flow FSM (boot, title, hub, briefing, mission, cutscene, debrief, quiz) and every
mission FSM use it. Missions declare checkpoints as states; the solvability test walks the
graph and proves every reachable state can reach "complete".

Consequences: softlocks become graph properties that tests can check; save stability is derived
from the current flow state.
