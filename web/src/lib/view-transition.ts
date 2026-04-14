type ViewTransitionCapable = Document & {
  startViewTransition: (
    callback: () => void | Promise<void>,
  ) => { finished: Promise<void> };
};

function isCapable(doc: Document): doc is ViewTransitionCapable {
  return typeof (doc as Partial<ViewTransitionCapable>).startViewTransition === 'function';
}

export function morphAndRun(element: HTMLElement | null, run: () => void): void {
  if (typeof document === 'undefined') {
    run();
    return;
  }
  const reduced =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !isCapable(document)) {
    run();
    return;
  }
  if (element) element.style.viewTransitionName = 'issue-morph';
  const transition = document.startViewTransition(() => {
    run();
  });
  void transition.finished.finally(() => {
    if (element) element.style.viewTransitionName = '';
  });
}

export function findCardElement(issueId: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(
    `[data-issue-id="${CSS.escape(issueId)}"]`,
  );
}
