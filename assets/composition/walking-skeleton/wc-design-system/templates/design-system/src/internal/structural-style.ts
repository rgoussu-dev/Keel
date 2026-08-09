const registered = new Set<string>();

/**
 * Injects a component's tag-scoped stylesheet into `document.head`
 * once per tag — the same light-DOM convention planks uses, so the
 * design system and its substrate style the page the same way.
 */
export function ensureStructuralStyle(tag: string, css: () => string): void {
  if (registered.has(tag)) return;
  registered.add(tag);
  const style = document.createElement('style');
  style.dataset.dsComponent = tag;
  style.textContent = css();
  document.head.appendChild(style);
}
