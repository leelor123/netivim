# Controller QA: Prologue and Chapter 1

Spec: `tests/e2e/controller-full.spec.ts` (helpers in `tests/e2e/helpers/`). Everything is driven through a mocked
`navigator.getGamepads` pad (buttons, sticks, triggers, unplug/replug). Phone viewport 1170x540 (Galaxy S9+ landscape).

Run: `npm run build:test`, then `PW_PORT=<free port> npx playwright test controller-full`.
`CTRL_FAMILIES=xbox,playstation,nintendo` limits families (default all three for the menu tests);
`CTRL_MISSION_FAMILIES=xbox,...` picks the families that play the five full missions (default `xbox`, they are slow on software GL).

## What is covered (per family: xbox, playstation, nintendo)

1. Title, Settings (bumper tab switch to Controls, remap Interact from the west button to L3, then use it), pause, manual
   save into a slot, exit prompt (B closes it), disconnect mid-mission (auto pause, touch UI back) and reconnect (auto resume).
2. New game, hub, Codex (bumpers = categories, list, entry detail, trigger scroll), Archive list and 3D viewer (right stick
   turns it), timeline (D-pad), briefing.
3. Missions (xbox full; other families via `CTRL_MISSION_FAMILIES`): Archive at Night (stick walk, interact, codex sheet,
   viewer, both lens panels, pause+save, label sorter, finale, opening cutscene skipped by holding A, debrief), Letters from
   Jaffa (tags, logistics planner by D-pad focus + A, cart, delivery, quiz), Tower and Stockade (planning table fully by
   pad: cursor, bumper type, Y rotate, A place; gravel, tower, fence, lenses panel, debrief), failure card + retry, Night
   Landing (vehicle by stick, soft fail card, retry), The Vote (decisions, note, radio, ledger scroll with triggers,
   quiz and return to hub). Long walks use the level warp / spawn helpers; every interaction is a pad button.

Checked on every tap: no `[data-touch-ui]` element visible while the pad is active, `data-pad-family` matches. At each
screen: exactly one drawn, on-screen focus ring; no other family's glyphs or touch wording in visible text; the interact,
codex and planning-table prompts show the family's glyph for the current bindings; console has no errors or warnings.

## Open findings (marked as KNOWN in the spec: they show as annotations, not failures)

### CQA-1 Stale focus rings after switching Settings tabs with the bumpers
- Repro: Title, Settings, press the tab bumper repeatedly (4x to Controls). Several tabs (`tab-audio`, `tab-accessibility`,
  `tab-gameplay`) keep the `.is-focus` ring at the same time as the current element, so 3-4 controls look focused.
- Also after a remap (`remap-interact` ring plus stale tab rings).
- Screenshots: `docs/controller-qa/*-focus-ring-stale-settings-controls.png` (all three families).
- Suspected: `src/ui/focusManager.ts` `refocusKey()` sets `this.current = null` before `focus(el)`, so `focus()` never removes
  `.is-focus` from the previous element.

### CQA-2 Archive viewer card clips on a phone; its Back button is off screen
- Repro: Hub, Archive, open any item (e.g. Basel Program). At 1170x540 the provenance card is cut at the section
  "מקור הפריט"; the focused Back button is below the screen and the card cannot be scrolled by the controller to reach it.
  B still closes the viewer, but the on-screen prompt is unreachable.
- Screenshot: `docs/controller-qa/xbox-focus-offscreen-archive-viewer.png`.
- Suspected: `src/gameplay/ui/codex.ts` `provenanceScreen` (card has no scroll body / sticky footer like the other sheets)
  and `.gp-provenance` in `src/gameplay/gameplay.css`.

### CQA-3 Touch wording on a controller (timeline hint)
- Repro: Hub, Chapters. Hint reads "scroll with the left stick, the arrows or the finger".
- Suspected: `src/locales/he/timeline.json` `timeline.hint` (show the finger variant only on touch).

## Observations (not asserted)
- Cutscene skip on a pad is a hold of A or B (1 s); the ring and hint are `data-touch-ui` and hidden on a controller, so a
  controller player gets no on-screen cue for it (`src/cinematics/overlay.ts`, `src/cinematics/index.ts`).
- The dirty-save indicator (`.nv-hudbtn--save`) is deliberately shown on a controller while progress is unsaved
  (`src/ui/ui.css`); it is not `data-touch-ui` and is pointer-events none.
- `ch00.tut.look` ("turn the view with the finger or the mouse") is shown in the Archive arrival tutorial when a controller
  is active if the look tutorial prompt is displayed (`src/locales/he/ch00.json`).
