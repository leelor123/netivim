import type { Game } from '../../game';
import type { LivingMapScreen } from '../livingMap/livingMapScreen';
import type { AnalogInput, HostedScreen, ScreenAction } from './screen';
import type { TimelineScreen } from './timelineScreen';

const ALL_ACTIONS: readonly ScreenAction[] = ['confirm', 'back', 'left', 'right', 'up', 'down', 'tabPrev', 'tabNext', 'alt'];

function readAnalog(game: Game): AnalogInput {
  const { move, look, scroll } = game.input;
  return { moveX: move.x, moveY: move.y, lookX: look.x, lookY: look.y, scroll };
}

/** Mounts one screen and feeds it actions and analog input from the game's input manager. */
export function hostScreen(game: Game, screen: HostedScreen, root: HTMLElement): () => void {
  screen.mount(root);
  const off = game.onStep((dt) => {
    for (const a of ALL_ACTIONS) if (game.input.justPressed(a)) screen.onAction(a);
    screen.update?.(dt, readAnalog(game));
  });
  return () => {
    off();
    screen.unmount();
  };
}

/**
 * Timeline docked under the map and linked to it. Routing: left stick, D-pad and confirm drive the
 * timeline; alt, tabPrev and tabNext switch the lens; the right stick and triggers drive the map camera.
 */
export function linkTimelineToMap(timeline: TimelineScreen, map: LivingMapScreen): () => void {
  map.linked = true;
  const offA = timeline.addScrubListener((p) => map.setPosition(p, false));
  const offB = map.addScrubListener((p) => timeline.setPosition(p, false));
  map.setPosition(timeline.currentPosition, false);
  return () => {
    offA();
    offB();
    map.linked = false;
  };
}

export function hostTimelineWithMap(game: Game, timeline: TimelineScreen, map: LivingMapScreen, root: HTMLElement): () => void {
  map.mount(root);
  timeline.mount(root);
  const unlink = linkTimelineToMap(timeline, map);
  const off = game.onStep((dt) => {
    for (const a of ALL_ACTIONS) {
      if (!game.input.justPressed(a)) continue;
      if (a === 'alt' || a === 'tabPrev' || a === 'tabNext' || a === 'up' || a === 'down') map.onAction(a);
      else timeline.onAction(a);
    }
    const analog = readAnalog(game);
    timeline.update(dt, analog);
    map.update(dt, { ...analog, moveX: 0 });
  });
  return () => {
    off();
    unlink();
    timeline.unmount();
    map.unmount();
  };
}
