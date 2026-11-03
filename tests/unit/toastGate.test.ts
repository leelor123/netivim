import { describe, expect, it } from 'vitest';
import { ToastGate, toastPlacement, type PendingToast } from '../../src/ui/toastGate';

function make(): { gate: ToastGate; shown: PendingToast[] } {
  const shown: PendingToast[] = [];
  return { gate: new ToastGate((t) => shown.push(t)), shown };
}

describe('toast placement', () => {
  it('moves to the top while a menu is open', () => {
    expect(toastPlacement(false)).toBe('bottom');
    expect(toastPlacement(true)).toBe('top');
  });
});

describe('ToastGate', () => {
  it('shows notices at once when no menu is open', () => {
    const { gate, shown } = make();
    gate.request('a', 'ok', true);
    expect(shown).toEqual([{ text: 'a', tone: 'ok' }]);
  });

  it('delays deferrable notices while a menu is open and shows them on close', () => {
    const { gate, shown } = make();
    gate.setMenuOpen(true);
    gate.request('quality lowered', 'ok', true);
    expect(shown).toHaveLength(0);
    expect(gate.hasPending).toBe(true);
    gate.setMenuOpen(false);
    expect(shown).toEqual([{ text: 'quality lowered', tone: 'ok' }]);
    expect(gate.hasPending).toBe(false);
  });

  it('lets direct feedback (save confirmations) through while a menu is open', () => {
    const { gate, shown } = make();
    gate.setMenuOpen(true);
    gate.request('saved');
    expect(shown).toHaveLength(1);
  });

  it('keeps only the newest pending notice, and never replaces a warning with a plain one', () => {
    const { gate, shown } = make();
    gate.setMenuOpen(true);
    gate.request('one', 'ok', true);
    gate.request('two', 'ok', true);
    gate.request('careful', 'warn', true);
    gate.request('three', 'ok', true);
    gate.setMenuOpen(false);
    expect(shown).toEqual([{ text: 'careful', tone: 'warn' }]);
  });
});
