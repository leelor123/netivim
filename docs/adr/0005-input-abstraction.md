# ADR 0005: Unified input actions with last-active-device UI mode

Status: accepted (2026-11-03)

Decision: Devices (gamepad via navigator.getGamepads, touch via pointer events, keyboard and
mouse) produce a per-step ActionState (move vector, look vector, buttons with pressed and
justPressed). A binding table maps device inputs to actions and is remappable and saved.
The InputManager tracks the last active device family and emits input:device-changed;
the UI hides all touch controls while the gamepad is active and restores them on first touch.
Gamepad family (xbox, playstation, nintendo, generic) is detected from the id string for glyphs.
Controller disconnect while playing emits input:gamepad-lost, which pauses the game.

Consequences: game code never reads devices directly; controller E2E tests mock getGamepads.
