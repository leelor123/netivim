export type Handler<P> = (payload: P) => void;
export type ErrorReporter = (event: string, error: unknown) => void;

/**
 * Typed publish/subscribe bus. A throwing handler is isolated so one system cannot break
 * another; the error goes to the reporter instead.
 */
export class EventBus<M extends { [K in keyof M]: unknown }> {
  private readonly handlers = new Map<keyof M, Set<Handler<never>>>();

  constructor(private readonly onError: ErrorReporter = () => undefined) {}

  on<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  once<K extends keyof M>(event: K, handler: Handler<M[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  off<K extends keyof M>(event: K, handler: Handler<M[K]>): void {
    const set = this.handlers.get(event);
    if (!set) return;
    set.delete(handler as Handler<never>);
    if (set.size === 0) this.handlers.delete(event);
  }

  emit<K extends keyof M>(event: K, payload: M[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    // Snapshot so handlers may subscribe or unsubscribe while we iterate.
    for (const handler of [...set] as Handler<M[K]>[]) {
      try {
        handler(payload);
      } catch (error) {
        this.onError(String(event), error);
      }
    }
  }

  listenerCount<K extends keyof M>(event: K): number {
    return this.handlers.get(event)?.size ?? 0;
  }

  clear(): void {
    this.handlers.clear();
  }
}
