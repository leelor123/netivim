/** Interactables: radius-based focus, a prompt and the interact action. Pure (visuals subscribe). */

export type InteractableKind = 'generic' | 'pickup' | 'lantern' | 'marker';

export interface Interactable {
  readonly id: string;
  readonly kind: InteractableKind;
  x: number;
  z: number;
  /** Focus radius in meters. */
  radius: number;
  /** Locale key of the prompt verb ("Pick up", "Listen"). */
  promptKey: string;
  enabled: boolean;
  onInteract(): void;
}

export type FocusListener = (next: Interactable | null, prev: Interactable | null) => void;

export class InteractionSystem {
  private readonly items = new Map<string, Interactable>();
  /** Array mirror of items so the per-step scan does not allocate an iterator. */
  private list: Interactable[] = [];
  private focusedItem: Interactable | null = null;
  private readonly listeners = new Set<FocusListener>();

  add(item: Interactable): Interactable {
    if (this.items.has(item.id)) throw new Error('Duplicate interactable ' + item.id);
    this.items.set(item.id, item);
    this.list.push(item);
    return item;
  }

  get(id: string): Interactable | undefined {
    return this.items.get(id);
  }

  remove(id: string): void {
    const it = this.items.get(id);
    if (!it) return;
    this.items.delete(id);
    this.list = this.list.filter((x) => x !== it);
    if (this.focusedItem === it) this.setFocus(null);
  }

  setEnabled(id: string, enabled: boolean): void {
    const it = this.items.get(id);
    if (it) it.enabled = enabled;
  }

  get focused(): Interactable | null {
    return this.focusedItem;
  }

  onFocus(fn: FocusListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** One step: nearest enabled item in range gets focus; interact runs it. Returns the item used. */
  update(px: number, pz: number, interactPressed: boolean): Interactable | null {
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (let i = 0; i < this.list.length; i++) {
      const it = this.list[i] as Interactable;
      if (!it.enabled) continue;
      const d = (it.x - px) ** 2 + (it.z - pz) ** 2;
      if (d <= it.radius * it.radius && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    if (best !== this.focusedItem) this.setFocus(best);
    if (interactPressed && best) {
      best.onInteract();
      return best;
    }
    return null;
  }

  clear(): void {
    this.items.clear();
    this.list = [];
    this.setFocus(null);
  }

  private setFocus(next: Interactable | null): void {
    const prev = this.focusedItem;
    this.focusedItem = next;
    for (const fn of this.listeners) fn(next, prev);
  }
}
