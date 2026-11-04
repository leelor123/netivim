import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOUCH_BUTTONS } from '../../src/ui/touch/joystick';

/**
 * Static guard (BRIEF 4 / 7 / 9: fully playable by touch, no softlock): every action a level reads
 * with justPressed / isDown must have a touch path:
 * - one of the on-screen touch buttons (TOUCH_BUTTONS), or
 * - a touch action bar item the level registers (ctx.touchActions: `action: 'x'` or a
 *   `['x', 'labelKey']` tuple table), or
 * - an entry in the level's TOUCH_ALTERNATIVES map that says how touch does it.
 */
const LEVELS = join(__dirname, '../../src/levels');

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

function readActions(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/(?:justPressed|isDown)\('([a-zA-Z]+)'\)/g)) out.add(m[1] as string);
  return out;
}

function touchCovered(src: string): Set<string> {
  const out = new Set<string>(TOUCH_BUTTONS);
  for (const m of src.matchAll(/action: '([a-zA-Z]+)'/g)) out.add(m[1] as string);
  for (const m of src.matchAll(/\['([a-zA-Z]+)', '[a-zA-Z.]+'\]/g)) out.add(m[1] as string);
  const alt = /TOUCH_ALTERNATIVES[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  if (alt) for (const m of (alt[1] as string).matchAll(/^\s*([a-zA-Z]+): '[^']{8,}'/gm)) out.add(m[1] as string);
  return out;
}

describe('every level action has a touch path', () => {
  const all = files(LEVELS);
  it('finds the level sources', () => {
    expect(all.length).toBeGreaterThan(5);
  });
  for (const file of all) {
    const src = readFileSync(file, 'utf8');
    const read = readActions(src);
    if (read.size === 0) continue;
    it(file.slice(LEVELS.length + 1).replace(/\\/g, '/'), () => {
      const covered = touchCovered(src);
      const missing = [...read].filter((a) => !covered.has(a));
      expect(missing, 'actions without a touch path').toEqual([]);
    });
  }

  it('catches a level that reads an action with no touch path', () => {
    const src = "if (ctx.input.justPressed('tabNext')) cycle();";
    expect([...readActions(src)].filter((a) => !touchCovered(src).has(a))).toEqual(['tabNext']);
    const fixed = src + "\nctx.touchActions([{ action: 'tabNext', label: 'x' }]);";
    expect([...readActions(fixed)].filter((a) => !touchCovered(fixed).has(a))).toEqual([]);
  });
});
