import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DIFFICULTY } from '../../src/core/difficulty';
import { loadChapter, loadLevel } from '../../src/gameplay/registry';
import { checkpointGaps, DIFFICULTIES, drive, HUMAN_FACTOR, minutes, readSeconds, type Probe } from './driver';

/**
 * Time estimate per mission (DESIGN 2 targets). Play time = for every checkpoint segment the
 * larger of the slowed bot time and the narrated subtitle time of that segment (a listener waits
 * for spoken lines); reading = briefing text at 12 words per second; extras = cutscene + debrief.
 * Set QA_DUMP=<file> to write the full table as JSON for QA_REPORT.md.
 */

const ORIENT_SECONDS = 15;
const DEBRIEF_SECONDS = 20;
const CHAPTER_CUTSCENE: Readonly<Record<string, number>> = { 'archive-night': 75, 'the-vote': 90 };
const QUIZ_SECONDS_PER_QUESTION = 20;

function playSeconds(p: Probe): number {
  const cps = [...p.checkpoints.map((c) => c.at), p.seconds];
  let total = 0;
  for (let i = 0; i < cps.length - 1; i++) {
    const a = cps[i] as number;
    const b = cps[i + 1] as number;
    const spoken = p.subtitles.filter((s) => s.at >= a && s.at < b).reduce((n, s) => n + s.durationMs / 1000, 0);
    total += Math.max((b - a) * HUMAN_FACTOR, spoken);
  }
  return total;
}

const CHAPTER_OF: Readonly<Record<string, string>> = { 'archive-night': 'prologue', 'jaffa-letters': 'prologue', 'tower-stockade': 'ch01', 'night-landing': 'ch01', 'the-vote': 'ch01' };

describe('time estimate', () => {
  it('computes minutes per mission and difficulty', async () => {
    const rows: Record<string, unknown>[] = [];
    for (const id of Object.keys(CHAPTER_OF)) {
      const def = await loadLevel(id);
      const ch = await loadChapter(CHAPTER_OF[id] as string);
      const meta = ch.content.missions.find((m) => m.id === def.missionId);
      const briefingWords = [meta?.summaryKey ?? '', ch.briefingContextKey, ...(meta?.learningGoalKeys ?? [])].reduce((n, k) => n + readSeconds(k), 0);
      for (const d of DIFFICULTIES) {
        const p = drive(def, { difficulty: d });
        const play = playSeconds(p);
        const total = ORIENT_SECONDS + briefingWords + play + (CHAPTER_CUTSCENE[id] ?? 0) + DEBRIEF_SECONDS;
        rows.push({
          mission: id,
          difficulty: d,
          botMin: minutes(p.seconds),
          playMin: minutes(play),
          briefingSec: Math.round(briefingWords),
          totalMin: minutes(total),
          targetMin: meta?.minutes,
          gapsSec: checkpointGaps(p).map(Math.round),
          maxAlert: Number(p.maxAlert.toFixed(2)),
          telegraphSec: DIFFICULTY[d].telegraphSeconds,
        });
        expect(total).toBeGreaterThan(0);
      }
    }
    const quiz: Record<string, number> = {};
    for (const c of ['prologue', 'ch01']) quiz[c] = (await loadChapter(c)).content.quiz.length * QUIZ_SECONDS_PER_QUESTION;
    if (process.env.QA_DUMP) writeFileSync(process.env.QA_DUMP, JSON.stringify({ rows, quiz }, null, 1));
  }, 300000);
});
