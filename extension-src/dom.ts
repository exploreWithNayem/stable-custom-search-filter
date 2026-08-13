/**
 * Tiny DOM helpers.
 *
 * Elements are always built with `textContent`, never `innerHTML`, so merchant
 * and Shopify supplied strings cannot inject markup (CLAUDE.md §16).
 */

type Attributes = Record<string, string | number | boolean | null | undefined>;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Attributes = {},
  children: (Node | string | null | undefined)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attributes)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === "class") node.className = String(value);
    else if (key === "text") node.textContent = String(value);
    else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }

  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.appendChild(
      typeof child === "string" ? document.createTextNode(child) : child,
    );
  }

  return node;
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function replaceChildren(node: Element, children: Node[]): void {
  clear(node);
  for (const child of children) node.appendChild(child);
}

export function all<T extends Element = HTMLElement>(selector: string): T[] {
  return Array.from(document.querySelectorAll<T>(selector));
}

export function one<T extends Element = HTMLElement>(
  selector: string,
  scope: ParentNode = document,
): T | null {
  return scope.querySelector<T>(selector);
}

export function show(node: Element | null, visible: boolean): void {
  if (!node) return;
  if (visible) node.removeAttribute("hidden");
  else node.setAttribute("hidden", "");
}

export function isTruthyAttr(node: Element | null, name: string): boolean {
  const value = node?.getAttribute(name);
  return value === "true" || value === "";
}

/** Traps Tab focus inside a container. Returns a cleanup function. */
export function trapFocus(container: HTMLElement): () => void {
  const selector =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(selector),
    ).filter((node) => node.offsetParent !== null);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  container.addEventListener("keydown", onKeydown);
  return () => container.removeEventListener("keydown", onKeydown);
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number,
): (...args: A) => void {
  let timer: number | undefined;
  return (...args: A) => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), delay);
  };
}
