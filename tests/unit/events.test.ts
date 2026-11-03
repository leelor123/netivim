import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/events';

type Map = { ping: { n: number }; pong: { s: string } };

describe('EventBus', () => {
  it('delivers typed payloads to subscribers', () => {
    const bus = new EventBus<Map>();
    const fn = vi.fn();
    bus.on('ping', fn);
    bus.emit('ping', { n: 1 });
    expect(fn).toHaveBeenCalledWith({ n: 1 });
  });

  it('unsubscribes via the returned function and via off', () => {
    const bus = new EventBus<Map>();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.on('ping', a);
    bus.on('ping', b);
    offA();
    bus.off('ping', b);
    bus.emit('ping', { n: 2 });
    expect(a).not.toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
    expect(bus.listenerCount('ping')).toBe(0);
  });

  it('is safe when a handler unsubscribes during emit', () => {
    const bus = new EventBus<Map>();
    const calls: string[] = [];
    const off = bus.on('ping', () => {
      calls.push('first');
      off();
    });
    bus.on('ping', () => calls.push('second'));
    bus.emit('ping', { n: 0 });
    bus.emit('ping', { n: 0 });
    expect(calls).toEqual(['first', 'second', 'second']);
  });

  it('isolates a throwing handler and reports it', () => {
    const onError = vi.fn();
    const bus = new EventBus<Map>(onError);
    const after = vi.fn();
    bus.on('pong', () => {
      throw new Error('boom');
    });
    bus.on('pong', after);
    bus.emit('pong', { s: 'x' });
    expect(after).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith('pong', expect.any(Error));
  });

  it('once fires a single time', () => {
    const bus = new EventBus<Map>();
    const fn = vi.fn();
    bus.once('ping', fn);
    bus.emit('ping', { n: 1 });
    bus.emit('ping', { n: 2 });
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
