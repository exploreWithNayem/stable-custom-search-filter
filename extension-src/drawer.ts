/**
 * Mobile filter drawer (CLAUDE.md §10.8, §20).
 *
 * Focus is trapped while open, body scroll is locked, Escape closes, and focus
 * returns to the trigger — the four things that make a drawer usable with a
 * keyboard or a screen reader.
 */

import { show, trapFocus } from "./dom";

export function initDrawer(sidebar: HTMLElement): void {
  const panel = sidebar.querySelector<HTMLElement>("[data-scfs-panel]");
  const openButton = sidebar.querySelector<HTMLElement>("[data-scfs-drawer-open]");
  const closeButton = sidebar.querySelector<HTMLElement>("[data-scfs-drawer-close]");
  const applyButton = sidebar.querySelector<HTMLElement>("[data-scfs-drawer-apply]");
  const scrim = sidebar.querySelector<HTMLElement>("[data-scfs-drawer-scrim]");

  if (!panel || !openButton) return;

  let releaseFocus: (() => void) | null = null;
  let previousOverflow = "";

  function open(): void {
    sidebar.classList.add("scfs-sidebar--open");
    openButton?.setAttribute("aria-expanded", "true");
    show(scrim, true);
    show(closeButton, true);

    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    releaseFocus = trapFocus(panel!);
    (closeButton ?? panel!).focus?.();
  }

  function close(): void {
    sidebar.classList.remove("scfs-sidebar--open");
    openButton?.setAttribute("aria-expanded", "false");
    show(scrim, false);

    document.body.style.overflow = previousOverflow;

    releaseFocus?.();
    releaseFocus = null;

    // Return focus where the shopper left it.
    openButton?.focus?.();
  }

  openButton.addEventListener("click", open);
  closeButton?.addEventListener("click", close);
  applyButton?.addEventListener("click", close);
  scrim?.addEventListener("click", close);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && sidebar.classList.contains("scfs-sidebar--open")) {
      close();
    }
  });

  // The drawer only exists below the desktop breakpoint; if the viewport grows
  // while it is open, restore the page rather than leaving scroll locked.
  const media = window.matchMedia("(min-width: 990px)");
  const onChange = (event: MediaQueryListEvent | MediaQueryList) => {
    if (event.matches && sidebar.classList.contains("scfs-sidebar--open")) close();
  };
  if ("addEventListener" in media) media.addEventListener("change", onChange);
}
