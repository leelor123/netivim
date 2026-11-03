import { describe, expect, it } from 'vitest';
import { ledgerRows, validateDecision } from '../../src/gameplay/core/ledger';
import { runBot } from '../../src/gameplay/runtime/bot';
import type { BotStep } from '../../src/gameplay/types';
import { HEBREW } from '../../src/locales';
import def from '../../src/levels/ch01/the-vote';
import {
  CARD_SLOT_OF_PARTY,
  CARD_SPOTS,
  DECISIONS,
  L,
  MAP_LAYERS,
  NOTE_DESK,
  PARTIES,
  PLACES,
  PLACE_DEFS,
  RADIO,
  STATION_X_OF_PARTY,
  TALLY,
} from '../../src/levels/ch01/vote/data';
import { partyOfSlot, VoteModel } from '../../src/levels/ch01/vote/model';

const walk = (x: number, z: number, within = 0.4): BotStep => ({ kind: 'walkTo', x, z, within });
const tap: BotStep = { kind: 'press', action: 'interact' };

describe('The Vote: progress model', () => {
  it('maps every card slot to exactly one party', () => {
    const parties = [0, 1, 2, 3].map((s) => partyOfSlot(s));
    expect(new Set(parties).size).toBe(4);
    expect(CARD_SLOT_OF_PARTY.length).toBe(PARTIES.length);
  });

  it('delivering the right card counts, the first wrong one retries, the second fails', () => {
    const m = new VoteModel();
    expect(m.deliver('yishuv')).toBe('none');
    const slot = CARD_SLOT_OF_PARTY[0] as number;
    expect(m.pickCard(slot)).toBe(true);
    expect(m.pickCard(1)).toBe(false);
    expect(m.deliver('britain')).toBe('retry');
    expect(m.deliver('palestinians')).toBe('fail');
    m.wrong = [0, 0, 0, 0];
    expect(m.deliver('yishuv')).toBe('ok');
    expect(m.deliveredCount).toBe(1);
    expect(m.carried).toBeNull();
  });

  it('the note only fails on the second submission without Jerusalem', () => {
    const m = new VoteModel();
    expect(m.submit()).toBe('warn');
    expect(m.submit()).toBe('fail');
    m.jerusalem = true;
    expect(m.submit()).toBe('ok');
  });

  it('asking a question once unlocks advice for that place and counts it', () => {
    const m = new VoteModel();
    expect(m.canAdvise('yishuv')).toBe(false);
    expect(m.ask('yishuv', 1)).toBe(true);
    expect(m.ask('yishuv', 2)).toBe(false);
    expect(m.canAdvise('yishuv')).toBe(true);
    m.advised.yishuv = true;
    expect(m.canAdvise('yishuv')).toBe(false);
    expect(m.placesWithQuestion()).toBe(1);
  });

  it('checkpoints imply the earlier progress and snapshots round-trip', () => {
    const m = new VoteModel();
    m.resetTo('visits');
    expect(m.layersSeen).toBe(MAP_LAYERS.length);
    expect(m.deliveredCount).toBe(PARTIES.length);
    expect(m.placesDone()).toBe(0);
    m.resetTo('note');
    expect(m.placesDone()).toBe(PLACES.length);
    const copy = new VoteModel();
    copy.restore(JSON.parse(JSON.stringify(m.snapshot())) as ReturnType<VoteModel['snapshot']>);
    expect(copy.snapshot()).toEqual(m.snapshot());
  });
});

describe('The Vote: decisions and the Choice Ledger', () => {
  it('every decision is valid and its ids are prefixed by the mission', () => {
    for (const d of DECISIONS) {
      expect(validateDecision(d), d.id).toEqual([]);
      expect(d.id.startsWith('the-vote-')).toBe(true);
    }
    expect(new Set(DECISIONS.map((d) => d.id)).size).toBe(DECISIONS.length);
    expect((def.decisions ?? []).length).toBe(DECISIONS.length);
  });

  it('the bot logs every decision and the ledger compares with the documented ones', () => {
    const r = runBot(def, { difficulty: 'normal' });
    expect(r.completed).toBe(true);
    expect(Object.keys(r.choices).sort()).toEqual(DECISIONS.map((d) => d.id).sort());
    const rows = ledgerRows(DECISIONS, r.choices);
    const byId = Object.fromEntries(rows.map((x) => [x.decision.id, x]));
    // The documented positions: Yishuv accepted the principle with reservations, the Arab side asked
    // the Court, Britain abstained. The bot picks exactly those.
    expect(byId['the-vote-advice-yishuv']?.matchesHistory).toBe(true);
    expect(byId['the-vote-advice-palestinians']?.matchesHistory).toBe(true);
    expect(byId['the-vote-advice-britain']?.matchesHistory).toBe(true);
    // No documented counterpart for the staffer or the neighbor.
    expect(byId['the-vote-prepare']?.decision.historical.optionId).toBeNull();
    expect(byId['the-vote-neighbor']?.decision.historical.optionId).toBeNull();
  });

  it('a different choice is recorded as different from history', () => {
    const rows = ledgerRows(DECISIONS, { 'the-vote-advice-britain': 'for' });
    const britain = rows.find((x) => x.decision.id === 'the-vote-advice-britain');
    expect(britain?.chosen?.id).toBe('for');
    expect(britain?.matchesHistory).toBe(false);
  });
});

describe('The Vote: defined failures', () => {
  it('delivering the same statement to the wrong party twice shows the ICJ card', () => {
    const slot = CARD_SLOT_OF_PARTY[1] as number; // Palestinians' statement
    const spot = CARD_SPOTS[slot] as { x: number; z: number };
    const wrongStation = STATION_X_OF_PARTY[0] as number;
    const script: BotStep[] = [walk(0, -41.5, 1), walk(spot.x, spot.z), tap, walk(wrongStation, -38.4), tap, { kind: 'wait', seconds: 0.1 }, tap];
    const r = runBot({ ...def, botScript: { ...def.botScript, statements: script } }, { difficulty: 'normal', fromCheckpoint: 'statements' });
    expect(r.failures.map((f) => f.reasonKey)).toEqual(['icj-misread']);
    expect(r.failures[0]?.info?.whatHappenedKey).toBe('ch01.vote.f1');
  });

  it('submitting the note without Jerusalem twice fails with the corpus separatum card', () => {
    const t = NOTE_DESK.typewriter;
    const script: BotStep[] = [walk(t.x, t.z + 0.35, 0.35), tap, { kind: 'wait', seconds: 0.1 }, tap];
    const r = runBot({ ...def, botScript: { ...def.botScript, note: script } }, { difficulty: 'normal', fromCheckpoint: 'note' });
    expect(r.failures.map((f) => f.reasonKey)).toEqual(['jerusalem-missed']);
    expect(r.failures[0]?.info?.whatHappenedKey).toBe('ch01.vote.f3');
  });

  it('trying to change the count needs a second deliberate press and shows the real result', () => {
    const base: BotStep[] = [walk(TALLY.x, TALLY.z - 1.1, 0.35), tap];
    const once = runBot({ ...def, botScript: { ...def.botScript, vote: [...base, { kind: 'wait', seconds: 1 }, ...(def.botScript.vote as BotStep[])] } }, { difficulty: 'normal', fromCheckpoint: 'vote' });
    expect(once.failures).toEqual([]);
    expect(once.completed).toBe(true);
    const twice = runBot({ ...def, botScript: { ...def.botScript, vote: [...base, { kind: 'wait', seconds: 0.1 }, tap] } }, { difficulty: 'normal', fromCheckpoint: 'vote' });
    expect(twice.failures.map((f) => f.reasonKey)).toEqual(['result-change']);
    expect(twice.failures[0]?.info?.whatHappenedKey).toBe('ch01.vote.f2');
  });

  it('every failure has a hint and sources', () => {
    for (const info of Object.values(def.failures)) {
      expect(info.hintKey).toBeTruthy();
      expect(info.sources.length).toBeGreaterThan(0);
      expect(HEBREW[info.whatHappenedKey]).toBeTruthy();
      expect(HEBREW[info.hintKey]).toBeTruthy();
    }
  });
});

describe('The Vote: content', () => {
  it('every locale key the level uses exists', () => {
    const keys: string[] = [];
    for (const d of DECISIONS) {
      keys.push(d.promptKey, d.historical.textKey);
      if (d.contextKey) keys.push(d.contextKey);
      for (const o of d.options) keys.push(o.labelKey, o.consequenceKey);
    }
    for (const p of PLACES) {
      const pd = PLACE_DEFS[p];
      keys.push(pd.speakerKey, pd.greetKey);
      for (const q of pd.questions) keys.push(q.promptKey, q.humanKey, q.factKey);
    }
    for (const l of MAP_LAYERS) keys.push(l.titleKey, l.factKey);
    for (let i = 1; i <= 4; i++) keys.push(L('prompt.card.' + String(i)));
    for (const party of PARTIES) keys.push(L('prompt.station.' + party));
    for (const k of ['prompt.table', 'prompt.tableNext', 'prompt.tableClose', 'prompt.listen', 'prompt.advice', 'prompt.page', 'prompt.submit', 'prompt.neighbor', 'prompt.radio', 'prompt.tally',
      'say.card', 'say.retry', 'say.page', 'say.noteOk', 'say.noteWarn', 'say.tally', 'radio.announce', 'neighbor.honest', 'neighbor.promise', 'neighbor.quiet', 'speaker.neighbor',
      'hint.map', 'hint.visits', 'hint.vote', 'map.hall', 'map.home', 'map.town', 'map.office', 'map.radio']) keys.push(L(k));
    for (const o of def.objectives) keys.push(o.textKey);
    const missing = keys.filter((k) => !Object.hasOwn(HEBREW, k));
    expect(missing).toEqual([]);
  });

  it('the level never states a UNSCOP claim and uses only the documented vote numbers', () => {
    const own = Object.entries(HEBREW).filter(([k]) => k.startsWith('levels.ch01.vote.'));
    expect(own.length).toBeGreaterThan(80);
    for (const [k, v] of own) {
      expect(v, k).not.toMatch(/אונסקו|UNSCOP/);
      for (const n of v.match(/\d+/g) ?? []) expect(['1', '2', '3', '4', '10', '13', '21', '20', '33', '181', '1937'], k + ': ' + v).toContain(n);
    }
  });

  it('the radio sits in the square and the tally board is away from it', () => {
    expect(Math.hypot(RADIO.x - TALLY.x, RADIO.z - TALLY.z)).toBeGreaterThan(3);
  });
});
