# Accessibility review: M2 (independent)

Scope: `src/ui/**`, `src/gameplay/ui/**`, `src/gameplay/gameplay.css`, `src/features/timeline`, `src/features/livingMap`, `src/ui/touch/**`, `src/cinematics` overlay, level overlays (`levels/ch00/shared`, `levels/ch01/tower`), `src/locales/he/*.json`.
Standard: WCAG 2.1 AA plus the project rules in BRIEF section 7 (controller-first, 48px targets, subtitles, reduced motion). `npm test`: 568/568 pass. Findings come from code reading and computed contrast; nothing was run in a browser (Playwright was off limits). Items that need a device check say so. Line numbers are approximate for files marked "~".

Assumed viewport: S26 Ultra landscape, 2340x1080 at DPR about 3, so roughly 780x360 CSS px. That is why the `max-height: 460px` and `max-width: 1100px` rules are the ones that apply.

Counts: **High 4, Medium 11, Low 12.**

## What is already good

- Menu focus ring (`ui.css:86-102`): 3px umber ring is 5.93:1 on paper, plus a sand glow and a diamond marker, so it does not depend on color alone.
- `ui.css` text: ink 13.8:1, secondary ink 8.2:1, stamp/umber 5.1 to 5.9:1. All pass.
- Every dialog starts on the safe action (exit prompt: Save and exit; overwrite and new game: Cancel). Back/B works on every `ScreenManager` screen. Covered screens are `inert` + `aria-hidden` (`uiScreen.ts` `cover`), so no focus trap was found. Pause, slots, settings, exit prompt and the remap dialog all have an exit.
- RTL math is careful: `nav.ts`, `scrub.ts`, `horizontalDelta`, slider direction, mirrored chevrons, `unicode-bidi: isolate` for years.
- All spoken text goes through `subtitle:show` (`cinematics/player.ts:229,273`, `missionHost.ts:304`; narration hooks the same event), so the subtitle size setting covers everything that is spoken. The four sizes (16/20/26/32px) are applied via `data-size` on `.nv-sub` and update live.
- Reduced motion in JS is thorough: cinematic shake dropped and fast moves replaced by cuts with a dip, orbit and vehicle camera snap, archive sway off, timeline snap off, `scrollIntoView` goes to `auto`, and `ui.css:45-47` kills every UI animation and transition.
- Quiz wrong answers use strike-through, not color alone. The timeline locked state uses a dashed dot plus a text badge.

## HIGH

### H1. Controller cannot scroll hosted gameplay screens, so text can be unreachable
- `gameplay/ui/host.ts:158-176` passes analog input only to `top.update`. Plain sheets have no `update`. Compare `ui/focusManager.ts:94-96`, which scrolls the top screen with triggers and right stick. `gameplay.css:21,32` (`max-block-size: 92vh`, about 330px, with `.gp-sheet__body {overflow-y:auto}`) means the briefing, debrief ledger (`screens.ts:237-270`), failure card, provenance card (`codex.ts:~94`, `gameplay.css:90`), codex detail and archive-night sheets (`levels/ch00/shared/overlay.ts:70-86`) can overflow at this size. Focus starts on a button with `preventScroll` (`host.ts:137`). The player lands on the action button and never reads the middle of the sheet. The Tower "Two Lenses" panel (`levels/ch01/tower/ui.ts:77-108`) has the same problem, and that is core educational content. The Living Map side panel (`livingMap.css:~23`, `.lm-panel overflow-y:auto`) is also unscrollable, because the right stick drives the camera there.
- Fix: in `ScreenStack.step`, when `top.update` is absent, scroll the nearest `.gp-sheet__body` / `.gp-provenance` / `.lm-panel` by `analog.lookY` and `analog.scroll`, exactly as `FocusManager.tick` does. Make each scroll container `tabindex="0"` with an accessible name. For the map, scroll the panel with the triggers and reserve the stick for the camera.

### H2. Focus ring on gameplay and level screens fails 3:1
- `gameplay.css:64` and `:79`: `outline: 3px solid #d9a441`. Computed 1.78:1 on the `#efe4c9` sheet and 2.00:1 on `#f8f1df` buttons. The same color is used for the sorter cursor (`archive.css:~60,~63`). The ring sits outside the button, so it is measured against the paper. There is no secondary marker like the menu diamond. For a controller-first game this is the main position cue on codex, quiz, decisions, briefing, debrief and sorter. Fails 1.4.11; 2.4.7 is borderline.
- Fix: `.gp-btn:focus-visible, .an-card.is-cursor, .an-tray.is-cursor { outline: 3px solid #2b2118; outline-offset: 2px; box-shadow: 0 0 0 6px #d9a441; }`. Dark inner ring is 12:1 on paper, and still contrasts around a dark primary button. Also add the `::before` diamond from `ui.css:93-102`.

### H3. Codex category tabs cannot be used by touch or assistive tech
- `codex.ts:~39`: tabs are `<span role="tab">` with no click handler, no `tabindex`, no `aria-controls`. Only LB/RB (`codex.ts:~61`) change category. Touch and keyboard players cannot filter. They are also tiny: `gameplay.css:81` has 14px text with `padding: 2px 10px`, about 24px high.
- Fix: render `<button role="tab" data-gp-focus>` with `min-block-size: 48px`, a click handler that sets `tab` and calls `render()`, `aria-controls` pointing at the list, and restore focus to the chosen tab after `replaceChildren` (see M2).

### H4. Subtitles sit under the cutscene bars and every gameplay overlay
- `#ui` (`.nv-root`, `ui.css:5-31`) has no `z-index`, and the subtitle element is inside it. Above it: `.touch-root` 20, `.tl` 20, `.gp-hud` 25, `.an-root` 26, `.gp-root` 30, `.cine` 30, tower lenses 45. `.cine-bar` is a black 12vh bar (`cinematics.css:5`, about 43 CSS px). Subtitles are placed at `bottom: pad-b + 12px` (about 26px, `ui.css:460-466`), so in letterboxed cutscenes roughly the lower half of the caption box is hidden behind the bottom bar. Under translucent sheets (`.gp-stage`, `.an-stage`) captions are dimmed by a 35 to 70% scrim. For deaf and hard-of-hearing players this is the primary channel. Based on stacking analysis, so confirm on device.
- Fix: move `.nv-sub` (and the toast) to their own top-level `position: fixed; z-index: 40` layer. When `.cine-letterbox` is active, offset by the bar height, for example `--cine-bar: 12vh` on `:root` and `bottom: calc(var(--nv-pad-b) + var(--cine-bar, 0px) + 12px)`.

## MEDIUM

### M1. Reduced motion is split between OS preference and in-game setting
- `install.ts:31-35` honors `prefers-reduced-motion` or the setting, but only for CSS under `.nv-root`. Cinematics (`cinematics/index.ts:81`), timeline (`features/timeline/install.ts:45`), living map and gameplay camera (`gameplay/director.ts:209,323,478`) read only `settings.accessibility.reducedMotion`. A player with OS reduce-motion on still gets cutscene shake and fast camera moves. Conversely `timeline.css:117` and `livingMap.css:~65` react only to the OS media query, not the in-game toggle (no CSS motion exists there today, so it is latent).
- Fix: one `game.reducedMotion()` (setting OR `matchMedia`), used by all of those call sites. Seed the setting default from the OS query on first run. Use `:root[data-motion='reduced']` in the two feature stylesheets.

### M2. Focus is lost or reset on hosted screens
- `codex.ts:~35-42` re-renders with `replaceChildren` on every tab change and search keystroke, so the focused element disappears and focus falls to `body`. `host.ts:76-80` `pop()` calls `focusFirst`, so returning from Codex to Hub puts focus on "Continue" instead of "Codex". Quiz and decision screens re-render too (`screens.ts:216-228,317`). `DomScreenHost.cover` already stores `lastFocus` for the `nv` stack; the `gp` stack does not.
- Fix: remember `lastFocus` per `GpScreen`, restore on `pop()`, and call a refocus-by-`data-key` helper after re-renders (items already carry `data-key`).

### M3. Timeline chapter nodes are below 48px
- `timeline.css:109-116` (any viewport under 1100px, so every phone): `.tl-node` is 40px wide and about 30px tall (4px padding + 18px dot, labels hidden). 13 nodes about 55px apart, so 48px wide fits. This is the touch path for chapter selection; mis-taps start the wrong chapter.
- Fix: `min-width: 48px; min-height: 48px` (or an `::after` hit-area extension). `.lm-btn` (`livingMap.css:~51`, about 41px high) and the `<summary>` (`livingMapScreen.ts:362`) need the same minimum. Also `.nv-tab` is 44px (`ui.css:232`), the `nv-choice` arrows are 40x44 (`ui.css:318,324`), and the archive sheet buttons are 40px (`archive.css:~75`).

### M4. Living Map: pinch has no single-pointer alternative, and the panel is not controller-operable
- `livingMapScreen.ts:255-258` zooms only by two-finger pinch or wheel. WCAG 2.5.1 (A) requires a single-pointer alternative. Add zoom +/- buttons (48px).
- `onAction` (`:161-184`) maps confirm to "toggle lens". The `<details>`/`<summary>` in the panel (`:361-369`) cannot be activated by controller, so the places list is reachable only by touch.

### M5. Cutscene overlay hides its own controls from assistive tech
- `cinematics/overlay.ts:26` puts `aria-hidden="true"` on a root that contains the skip `<button>` and the title card. Skip is also hold-only (`overlay.ts:74-77`), with no tap alternative for players with motor difficulty.
- Fix: drop `aria-hidden` from the skip control (or `inert` the whole root and expose a separate labeled button), give `.cine-card` `role="status"`, and offer a double-confirm skip alternative.

### M6. Subtitle timers run on wall clock and subtitles hide behind menus
- `subtitles.ts:34` uses `setTimeout`, so a caption expires while the game is paused. `ui.css:469` also hides `.nv-sub` whenever a UI screen is open. A line that was mid-sentence when the player paused is lost on resume.
- Fix: pause the timer on `flow:pause-changed` and re-show the remaining caption on resume, or keep captions docked at the top over the pause scrim. Also, `aria-live` on an element toggled with `hidden` (`subtitles.ts:12,21`) is announced inconsistently; keep the region in the layout and swap the text.

### M7. Small text at phone size
Roughly 780x360 CSS px viewed from controller distance. Informational text at 12 to 13px (and no UI text-size option; the setting only scales subtitles):
- `ui.css:72` (button sub, 13), `:145` (version, 13), `:258` (row note, 13), `:393-395` (chapter number and state, 13), `:371` (slot place, 14).
- `gameplay.css:38` (sources, 13), `:63` (button sub, 13), `:68` (label chip, 12), `:106` (HUD label, 12), `:108` (steps, 14).
- `timeline.css:64` (node captions, 12), `:104,106` (12), `:98` (13).
- `livingMap.css:~10` (labels, 13), `~38` (panel, 14), sources and notes (12).
- `tower.css:~36` (plan controls, 13).
- Fix: floor at 14px for secondary text and 16px for reading text, or add a "UI text size" setting that scales `html { font-size }` (everything uses px today, so convert to rem as you touch it). Consider defaulting subtitles to `large` for controller viewing distance.

### M8. Sorter overlay re-renders DOM on every cursor move
- `levels/ch00/shared/overlay.ts:113-141` rebuilds cards and trays with `replaceChildren` each step. The cursor is a CSS class only (`archive.css:~60`), with no `aria-current`, and DOM focus is lost every move. With H2 it is the weakest-signalled interaction in the game.
- Fix: update classes in place, set `aria-current="true"` on the cursor item and call `.focus({preventScroll:true})` on it.

### M9. Hardware keyboard: text entry and double activation
- `core/input/inputManager.ts:94-99` records every `keydown` code with no text-entry guard. Typing in the codex search (`codex.ts:~23`) with letters bound to actions moves focus out of the field (`host.ts:178-192`); left/right cannot move the caret. Android IME keys usually have an empty `code`, so this is mainly a desktop problem.
- `host.ts:193-198` clicks the focused button on `confirm` but never `preventDefault`s the native Enter/Space click that the same key already triggers, unlike `focusManager.ts:192-198` (preventDefault plus `DUPLICATE_WINDOW`). Likely double activation (for example a quiz answer, then "next") on Enter. Needs a quick manual check.
- Fix: ignore actions when `e.target` is an input, textarea or contenteditable; mirror the `FocusManager` duplicate-key guard in `ScreenStack`.

### M10. Remap flow
- `settings.ts:250-269`: during capture `focus.suspended = true`, so B cannot cancel; only the 6s timeout, Esc/Backspace or touching Cancel works. A controller-only player who opens the wrong row must wait.
- `bindings.ts:54-62`: remapping appends the action to a button that may already have another action; there is no conflict warning, so two actions can share a button silently.
- `settings.ts:235`: remap rows show generic `ui.pad.*` names, not the family glyphs (`glyphs.ts`) used everywhere else.
- Fix: treat holding Back for 1s as cancel, or show a "hold to cancel" hint; show a "also used by X, swap?" prompt; reuse `glyphFor(...)` for names.

### M11. Planner buttons have no accessible names
- `planner.ts:~29,34` (`gpButton('−')` / `gpButton('+')`): a screen reader hears "minus" or "plus" with no route, and the row is not grouped. Width is about 48px, borderline. Fix: `aria-label` such as "{route}: remove vehicle", and wrap each row in `role="group"` with `aria-labelledby` on the route name.

## LOW

1. **Toast timeout is fixed 2.6s** (`hud.ts` `TOAST_MS`). The save-failed warning (`ui.toast.failed`) may vanish before it is read. Keep `warn` toasts until the next input.
2. **Chapters screen is a dead end** (`screens/chapters.ts` ~28-35): cards have no click handler, even "prologue", and locked cards give no feedback on confirm. Placeholder, but a controller user gets silence.
3. **Settings tabs ARIA** (`settings.ts:274`): `role="tab"` without `aria-controls`.
4. **Dialog semantics.** `gp-sheet` uses `role="dialog"` without `aria-modal` and the page behind is not inert (`screens.ts:30`, `codex.ts:~52`, `planner.ts:~63`, `tower/ui.ts:105`, `overlay.ts:83`). Nv panels are plain `<section aria-labelledby>` (`context.ts:~38`) while the pause stage carries `role=dialog`. Be consistent.
5. **Live region insertion.** A `role="status"` created together with its text (`screens.ts:321`, quiz feedback) is not reliably announced. Keep an empty live region in the DOM and set its text.
6. **Quiz stars** (`screens.ts:290`): `aria-label` on a `<p>` is ignored; the glyphs read as "black star". Use `role="img"`.
7. **Mission meter** (`missionHud.ts:~22`, `gameplay.css:134-136`): `role="meter"` has no name; the "high" state differs only by color (`#e07a5f` vs `#e8b04a` is 1.51:1). Add `aria-label`, plus a text or icon change at high level.
8. **Timeline live region floods.** `timelineScreen.ts:89` makes the whole detail panel `aria-live="polite"` and re-renders it on every index change, so scrubbing queues announcements. Announce only the era title via the existing `role="status"` line.
9. **Tab bumper direction is inconsistent.** Settings LB/RB move visually left/right (`nav.ts:104-108`), but Codex (`codex.ts:~61`) and Timeline (`timelineScreen.ts:134-141`) use logical prev/next, so in RTL LB goes visually right there.
10. **Non-text contrast.** Switch, choice and remap borders are `#c9b48a` on `#e4d6b6`, 1.41:1 (`ui.css:291-299`); slider track 1.44:1 (`:274`); `gp-btn` border 2.86:1 (`gameplay.css:53`). State is still conveyed by text and a dark fill, so this mostly affects low-vision players who lose control outlines. Darken borders to about `#8a7550`.
11. **Contrast that depends on the scene (verify on device).** Title brand text over the sky: kicker, version and covered-date estimated 2.7 to 3.1:1 (`ui.css:121-145`, 13 to 20px). Gameplay HUD label `#d9b77a` on the 62% dark panel is 2.9:1 against a bright background (`gameplay.css:101,106`; raise panel alpha to 0.8). Touch buttons and the cutscene skip label are about 2.3 to 2.4:1 against a bright background at the default 0.7 opacity (`touch.css:2-5`, `cinematics.css:14-19`); the opacity slider goes as low as 30% (`settings.ts:195`), so raise the minimum to 50% and add a darker backing.
12. **Touch layer and viewport.** Touch buttons are real `<button>`s with only pointer handlers (`touchControls.ts` button setup), so Tab reaches controls that do nothing on Enter; set `tabindex="-1"`. `index.html:5` uses `user-scalable=no` (fails 1.4.4 for a web build; fine in the native shell, but state it). The hard-coded `'→ '` back arrow (`ui.css:198`) and `inset-inline-*` with physical safe-area values (`ui.css:403`, `gameplay.css:99`) need revisiting for the Phase 2 LTR languages.

## Checklist by screen (controller path, no touch)

| Screen | Reachable | Focus visible | Back | Notes |
|---|---|---|---|---|
| Title, settings (5 tabs), pause, slots, exit prompt, overwrite, new game | yes | yes (5.9:1 + marker) | yes | Remap capture cannot be cancelled with B (M10) |
| Chapters (placeholder) | yes | yes | yes | no action on cards (Low 2) |
| Hub, briefing, failure, decision, debrief, quiz | yes | weak (H2) | yes, except decision (intentional) | long sheets unscrollable (H1) |
| Codex | partly | weak (H2) | yes | tabs bumper-only (H3), focus lost on tab change (M2) |
| Archive list and viewer | yes | weak (H2) | yes | provenance card unscrollable (H1) |
| Timeline | yes | yes (white 3px) | yes | nodes under 48px (M3) |
| Living map | era and lens only | yes | yes | panel and places not operable (M4, H1) |
| Planner, sorter, Tower lenses | yes | weak (H2) | yes | names (M11), re-render (M8), scroll (H1) |

## Suggested order of work

1. H1 (shared scroll in `ScreenStack`), H2 (one CSS focus rule), H4 (subtitle layer and letterbox offset). Small changes, large effect.
2. H3 plus M2 (codex tabs as buttons, focus restoration), M3 (hit areas), M9 (input guard).
3. M1 (single reduced-motion source), M6 (subtitle timers), M5, M7.
4. Low items in passing.
