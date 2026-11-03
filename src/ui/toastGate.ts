export type ToastPlacement = 'bottom' | 'top';

/** Toasts sit at the bottom, where menus live; while a menu is open they move to the top. */
export function toastPlacement(menuOpen: boolean): ToastPlacement {
  return menuOpen ? 'top' : 'bottom';
}

export interface PendingToast {
  readonly text: string;
  readonly tone: 'ok' | 'warn';
}

/**
 * Holds deferrable notices (graphics changes, unlock hints) while a menu is open and releases the
 * newest one when the menu closes, so they never cover menu content. Immediate toasts (save
 * confirmations the player just asked for) pass straight through.
 */
export class ToastGate {
  private menuOpen = false;
  private pending: PendingToast | null = null;

  constructor(private readonly present: (toast: PendingToast) => void) {}

  get isMenuOpen(): boolean {
    return this.menuOpen;
  }

  get hasPending(): boolean {
    return this.pending !== null;
  }

  /** Shows now, or (when `deferrable` and a menu is open) after the menu closes. */
  request(text: string, tone: 'ok' | 'warn' = 'ok', deferrable = false): void {
    if (deferrable && this.menuOpen) {
      // A warning is never replaced by a plain notice.
      if (this.pending?.tone === 'warn' && tone !== 'warn') return;
      this.pending = { text, tone };
      return;
    }
    this.present({ text, tone });
  }

  setMenuOpen(open: boolean): void {
    if (open === this.menuOpen) return;
    this.menuOpen = open;
    if (!open && this.pending) {
      const toast = this.pending;
      this.pending = null;
      this.present(toast);
    }
  }
}
