// A modal makes nodes outside its subtree inert, including ordinary popovers.
// Keep extension overlays inside the active modal and above page top-layer UI.
export function mountPageOverlay(host: HTMLElement) {
  const controller = new AbortController();
  let modal: HTMLDialogElement | null = null;
  let queued = false;
  let disposed = false;
  const sync = () => {
    queued = false;
    if (disposed) return;
    if (!modal?.isConnected || !modal.matches(":modal"))
      modal =
        document.activeElement?.closest<HTMLDialogElement>("dialog:modal") ??
        [...document.querySelectorAll<HTMLDialogElement>("dialog:modal")].at(
          -1,
        ) ??
        null;
    const parent =
      modal ?? document.fullscreenElement ?? document.documentElement;
    // Re-entering the top layer also handles a page popover opened after us.
    if (host.matches(":popover-open")) host.hidePopover();
    if (host.parentElement !== parent) parent.append(host);
    host.showPopover();
  };
  const schedule = () => {
    if (!queued) {
      queued = true;
      queueMicrotask(sync);
    }
  };
  const update = (event: Event) => {
    const target = event.target;
    if (
      !(target instanceof Element) ||
      target.closest("taylr-tools,taylr-highlight")
    )
      return;
    const next = target.closest<HTMLDialogElement>("dialog:modal");
    if (next) modal = next;
    if (
      event.type === "focusin" &&
      host.parentElement === (modal ?? document.documentElement)
    )
      return;
    schedule();
  };
  host.setAttribute("popover", "manual");
  sync();
  // Frameworks can remove an open dialog without emitting a close toggle.
  const observer = new MutationObserver(() => {
    if (!host.isConnected) schedule();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  document.addEventListener("fullscreenchange", schedule, {
    signal: controller.signal,
  });
  for (const type of ["beforetoggle", "toggle", "focusin"])
    document.addEventListener(type, update, {
      capture: true,
      signal: controller.signal,
    });
  return () => {
    disposed = true;
    controller.abort();
    observer.disconnect();
    if (host.matches(":popover-open")) host.hidePopover();
    host.remove();
  };
}
