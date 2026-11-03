type Listenable = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/**
 * Calls onExit whenever the app may be about to die: tab hidden or app switched
 * (visibilitychange, the most reliable on mobile), pagehide and the Page Lifecycle freeze.
 * Returns an unbind function.
 */
export function bindExitTriggers(win: Listenable, doc: Listenable & { readonly visibilityState: string }, onExit: (trigger: string) => void): () => void {
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') onExit('visibilitychange');
  };
  const onPageHide = (): void => onExit('pagehide');
  const onFreeze = (): void => onExit('freeze');
  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('freeze', onFreeze);
  win.addEventListener('pagehide', onPageHide);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    doc.removeEventListener('freeze', onFreeze);
    win.removeEventListener('pagehide', onPageHide);
  };
}
