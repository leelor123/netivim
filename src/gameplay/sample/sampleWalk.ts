import { stoneVillageHouse } from '../../world/kit/buildings';
import { oliveTree } from '../../world/kit/nature';
import { barrel, crate } from '../../world/kit/props';
import { box, circle } from '../core/collision';
import { MissionTimer } from '../core/telegraph';
import { LevelWorld } from '../runtime/levelKit';
import { PlayerController } from '../runtime/player';
import { defineLevel, type Level, type LevelContext } from '../types';

/**
 * SAMPLE LEVEL (framework test fixture, not historical content): walk to a marker, open the
 * document there, make one small decision, complete. Used by unit tests, the solvability
 * harness and the gameplay E2E. Chapter builders can copy its structure.
 */

type S = 'walk' | 'interact' | 'decide';
type E = 'arrive' | 'read' | 'chosen';

const SPAWN = { x: 0, z: -6, heading: 0 };
const GOAL = { x: 0, z: 8 };
const ARRIVE_RADIUS = 1.4;
const WALK_TIME = 90;

export const SAMPLE_DECISION_ID = 'sample-walk-share';

function build(ctx: LevelContext<E>): Level {
  const world = new LevelWorld({ seed: 'sample-walk', era: 'mandate1940', biome: 'coastalPlain', size: 64, quality: ctx.quality, waterLevel: null });
  const era = 'mandate1940' as const;
  // A few kit props with colliders so the walk has something to steer around.
  world.place(stoneVillageHouse({ era, seed: 'sample-house' }), -9, 4, 0.2, box(-9, 4, 3.2, 3.2, 4));
  world.place(oliveTree({ era, seed: 'sample-olive-a' }), 6, 0, 0, circle(6, 0, 0.6));
  world.place(oliveTree({ era, seed: 'sample-olive-b' }), 7, 9, 1, circle(7, 9, 0.6));
  world.place(crate({ era }), 2.2, 8.5, 0.4, circle(2.2, 8.5, 0.5, 1));
  world.place(barrel({ era, seed: 'sample-barrel' }), -2, 9.2, 0, circle(-2, 9.2, 0.4, 1.2));

  const player = new PlayerController(world, ctx.input, ctx.reducedMotion, { era });
  const marker = world.addMarker(GOAL.x, GOAL.z, '#f2c14e');
  world.onVisual((_dt, elapsed) => marker.animate(elapsed, ctx.reducedMotion()));

  const timer = new MissionTimer(WALK_TIME, () => ctx.params().timerScale);
  const doc = ctx.interactions.add({
    id: 'sample-document',
    kind: 'pickup',
    x: GOAL.x,
    z: GOAL.z,
    radius: 2.2,
    promptKey: 'gameplay.prompt.read',
    enabled: false,
    onInteract: () => {
      doc.enabled = false;
      ctx.unlock('archive', 'sample-letter');
      ctx.objectives.progress('open', 1);
      ctx.mission.send('read');
      ctx.decide(SAMPLE_DECISION_ID, () => {
        ctx.mission.send('chosen');
      });
    },
  });
  const offFocus = ctx.interactions.onFocus((next) => marker.setHighlight(next === doc));

  const scene = world.gameScene(() => offFocus());
  return {
    scene,
    player,
    update(dt) {
      player.update(dt);
      if (ctx.mission.state === 'walk') {
        if (Math.hypot(player.x - GOAL.x, player.z - GOAL.z) <= ARRIVE_RADIUS) {
          ctx.objectives.progress('walk', 1);
          ctx.mission.send('arrive');
          doc.enabled = true;
        } else if (timer.update(dt)) {
          ctx.mission.fail('gameplay.sample.fail.slow');
        }
      }
    },
    enterCheckpoint(checkpoint, data) {
      timer.reset();
      const saved = data as { x?: unknown; z?: unknown } | null;
      if (saved && typeof saved.x === 'number' && typeof saved.z === 'number') player.spawn(saved.x, saved.z, SPAWN.heading);
      else if (checkpoint === 'walk') player.spawn(SPAWN.x, SPAWN.z, SPAWN.heading);
      else player.spawn(GOAL.x, GOAL.z - 1.2, SPAWN.heading);
      doc.enabled = checkpoint === 'interact';
      marker.setVisible(true);
    },
    snapshotData: () => ({ x: player.x, z: player.z }),
    dispose: () => scene.dispose(),
  };
}

export default defineLevel<S, E>({
  id: 'sample-walk',
  chapterId: 'sample',
  missionId: 'sample-walk',
  sample: true,
  mission: {
    id: 'sample-walk',
    chapterId: 'sample',
    gameplayType: 'EXP',
    checkpoints: ['walk', 'interact'],
    machine: {
      initial: 'walk',
      final: ['complete'],
      transitions: {
        walk: { arrive: 'interact' },
        interact: { read: 'decide' },
        decide: { chosen: 'complete' },
        failed: {},
        complete: {},
      },
    },
  },
  objectives: [
    { id: 'walk', textKey: 'gameplay.sample.objective.walk', states: ['walk'] },
    { id: 'open', textKey: 'gameplay.sample.objective.open', states: ['interact', 'decide'] },
  ],
  failures: {
    'gameplay.sample.fail.slow': {
      whatHappenedKey: 'gameplay.sample.fail.slow.what',
      sources: [],
      label: 'composite',
      hintKey: 'gameplay.sample.fail.slow.hint',
    },
  },
  decisions: [
    {
      id: SAMPLE_DECISION_ID,
      promptKey: 'gameplay.sample.decision.prompt',
      options: [
        { id: 'archive', labelKey: 'gameplay.sample.decision.archive', consequenceKey: 'gameplay.sample.decision.archive.result' },
        { id: 'family', labelKey: 'gameplay.sample.decision.family', consequenceKey: 'gameplay.sample.decision.family.result' },
      ],
      historical: { optionId: 'archive', textKey: 'gameplay.sample.decision.history', sources: [], label: 'composite' },
    },
  ],
  botScript: {
    walk: [{ kind: 'walkTo', x: GOAL.x, z: GOAL.z, within: 1.0 }],
    interact: [{ kind: 'press', action: 'interact' }, { kind: 'choose', optionId: 'archive' }],
    decide: [],
  },
  briefingMap: {
    size: 64,
    points: [
      { x: SPAWN.x, z: SPAWN.z, kind: 'start', labelKey: 'gameplay.map.start' },
      { x: GOAL.x, z: GOAL.z, kind: 'goal', labelKey: 'gameplay.map.goal' },
      { x: -9, z: 4, kind: 'poi' },
    ],
  },
  build,
});
