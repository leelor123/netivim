# ADR 0007: DOM UI overlay with a focus-navigation graph

Status: accepted (2026-11-03)

Decision: Menus and HUD are DOM over the canvas (crisp Hebrew text, RTL, accessible). A
FocusManager moves focus spatially between elements marked focusable; D-pad and stick map to
directions; A confirms, B goes back, bumpers switch tabs. Text is only set via textContent.

Consequences: controller and touch share the same UI; tests can drive menus through actions.
