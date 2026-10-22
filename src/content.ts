import { request, requestResult, type SiteProfile } from "./model";
import { capturePreview, componentText, summarize } from "./preview";
import { canSelect, selectorFor } from "./selector";
import type { Inspector, InspectorState, ThemeStatus } from "./inspector";

if (!window.__taylr) window.__taylr = createInspector();

function createInspector(): Inspector {
  let profile: SiteProfile = { version: 1, origin: location.origin, rules: [] };
  let profileUpdates = 0;
  let themeStatus: ThemeStatus = "off";
  let themeRevision = 0;
  let open = false;
  let picker: AbortController | null = null;
  let selected: Element | null = null;
  let hovered: Element | null = null;
  let refined = false;
  let childHistory: Element[] = [];
  let frame = 0;
  let busy = false;
  let sessionIds: string[] = [];
  let status = "";
  let error = false;
  let focusSerial = 0;
  let openRevision = 0;
  let previousFocus: Element | null = null;
  let uiHost: HTMLElement | null = null;
  let previousCss = "";
  let rendering = Promise.resolve();
  let renderFailed = false;
  const listeners = new Set<() => void>();
  const highlightHost = document.createElement("taylr-highlight");
  highlightHost.style.cssText =
    "all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483646!important;";
  const shadow = highlightHost.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style class="darkreader">:host{color-scheme:dark}.outline{position:fixed;inset:0 auto auto 0;box-sizing:border-box;border:2px solid #ff8ba2;background:rgba(255,94,126,.07);box-shadow:0 0 0 1px rgba(40,12,26,.55),0 0 18px rgba(255,94,126,.13);border-radius:6px;pointer-events:none}.outline[hidden]{display:none}</style><div class="outline" hidden></div>`;
  const outline = shadow.querySelector<HTMLElement>(".outline")!;
  const style = document.createElement("style");
  style.dataset.taylr = "rules";
  let snapshot: InspectorState;
  const visible = (element: Element | null): element is Element =>
    !!element &&
    canSelect(element) &&
    element !== uiHost &&
    element !== highlightHost &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === "visible";
  const parentOf = () =>
    visible(selected?.parentElement ?? null) ? selected!.parentElement : null;
  const childOf = () => {
    const remembered = childHistory.at(-1);
    if (remembered?.parentElement === selected && visible(remembered))
      return remembered;
    return [...(selected?.children ?? [])].find(visible) ?? null;
  };
  function label(element: Element) {
    const heading = [...element.querySelectorAll("h1,h2,h3")].find(visible);
    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("alt") ||
      element.getAttribute("title") ||
      componentText(heading ?? element) ||
      element.localName
    ).slice(0, 80);
  }
  function publish() {
    snapshot = {
      open,
      picking: !!picker,
      busy,
      themeStatus,
      profile,
      hasHidden: sessionIds.length > 0,
      canUndo: sessionIds.some((id) =>
        profile.rules.some((rule) => rule.id === id),
      ),
      selection: selected
        ? { label: label(selected), parent: !!parentOf(), child: !!childOf() }
        : null,
      status,
      error,
      focusSerial,
    };
    listeners.forEach((listener) => listener());
  }
  const notify = () =>
    void chrome.runtime
      .sendMessage({ type: "picker-state", active: !!picker })
      .catch(() => {});
  function mountStyle() {
    if (document.documentElement && !style.isConnected)
      document.documentElement.append(style);
  }
  function syncTheme() {
    const revision = ++themeRevision;
    themeStatus = profile.darkMode && !profile.paused ? "applying" : "off";
    publish();
    void chrome.runtime
      .sendMessage({ type: "theme-sync" })
      .then((result) => {
        if (revision !== themeRevision) return;
        themeStatus = result?.status ?? "error";
        if (result?.error) {
          status = result.error;
          error = true;
        }
        publish();
      })
      .catch(() => {
        if (revision !== themeRevision) return;
        themeStatus = "error";
        status = "Could not update dark mode. Reload to try again.";
        error = true;
        publish();
      });
  }
  matchMedia("(forced-colors: active)").addEventListener("change", syncTheme);
  function apply(next: SiteProfile) {
    profile = next;
    syncTheme();
    if (profile.paused) stop();
    mountStyle();
    const css = (profile.paused ? [] : profile.rules)
      .map((rule) => `${rule.selector} { display: none !important; }`)
      .join("\n");
    style.textContent = css;
    rendering = rendering
      .then(async () => {
        const result = await chrome.runtime.sendMessage({
          type: "render",
          previous: previousCss,
          css,
        });
        if (result?.error) throw new Error(result.error);
        previousCss = css;
        renderFailed = false;
      })
      .catch(() => {
        renderFailed = true;
        status = "Saved, but this page needs a reload to update.";
        error = true;
        publish();
      });
    publish();
  }
  function drawOutline() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!selected) return;
    if (!visible(selected)) {
      select(null);
      return;
    }
    const rect = selected.getBoundingClientRect();
    outline.style.transform = `translate3d(${rect.x}px,${rect.y}px,0)`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    frame = requestAnimationFrame(drawOutline);
  }
  function select(element: Element | null, preserve = false) {
    selected = visible(element) ? element : null;
    refined = preserve;
    if (!preserve) childHistory = [];
    outline.hidden = !selected;
    drawOutline();
    publish();
  }
  function pointerTarget(element: Element | null) {
    if (!element || element.matches("img,canvas,video,audio,iframe"))
      return element;
    return (
      element.closest('button,[role="button"],input,select,textarea') ??
      element.closest("svg") ??
      element
    );
  }
  const insideToolbar = (event: Event) =>
    !!uiHost && event.composedPath().includes(uiHost);
  function parent() {
    const next = parentOf();
    if (next && selected) {
      childHistory.push(selected);
      select(next, true);
    }
  }
  function child() {
    const next = childOf();
    if (next) {
      childHistory.pop();
      select(next, true);
    }
  }
  function stop() {
    if (!picker) return;
    picker.abort();
    picker = null;
    hovered = null;
    select(null);
    highlightHost.remove();
    status = "";
    error = false;
    focusSerial++;
    notify();
    publish();
  }
  function close() {
    stop();
    open = false;
    openRevision++;
    publish();
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
      previousFocus.focus({ preventScroll: true });
  }
  function toggle() {
    if (open) return close();
    previousFocus = document.activeElement;
    open = true;
    openRevision++;
    status = "";
    error = false;
    publish();
  }
  async function start() {
    if (busy || picker || !open || profile.paused) return;
    const revision = openRevision;
    const restoreFocus = uiHost?.shadowRoot?.activeElement?.id === "hide";
    busy = true;
    status = "";
    error = false;
    publish();
    try {
      const registration = await chrome.runtime.sendMessage({
        type: "register",
        origin: location.origin,
      });
      if (registration?.error) throw new Error(registration.error);
      if (!open || revision !== openRevision || profile.paused) return;
      picker = new AbortController();
      const { signal } = picker;
      sessionIds = [];
      document.documentElement.append(highlightHost);
      notify();
      window.addEventListener(
        "focusin",
        (event) => {
          // Site focus managers also create trusted focus events. Preserve an
          // explicit Parent/Child choice until pointer input or native Tab.
          if (event.isTrusted && !refined && !insideToolbar(event)) {
            // Focus changed the selection independently of the pointer. The
            // next move must retarget even when it returns to the same node.
            hovered = null;
            select(event.target instanceof Element ? event.target : null);
          }
        },
        { capture: true, signal },
      );
      window.addEventListener(
        "pointermove",
        (event) => {
          if (!event.isTrusted || insideToolbar(event)) return;
          (uiHost?.shadowRoot?.activeElement as HTMLElement | null)?.blur();
          const target = event.target instanceof Element ? event.target : null;
          if (target !== hovered || !selected) {
            hovered = target;
            if (!refined || !selected?.contains(target))
              select(pointerTarget(target));
          }
        },
        { capture: true, signal },
      );
      const intercept = (event: Event) => {
        if (insideToolbar(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (
          event.type === "click" &&
          event.isTrusted &&
          !(event as MouseEvent).ctrlKey &&
          !(event as MouseEvent).metaKey &&
          !(event as MouseEvent).altKey &&
          !(event as MouseEvent).shiftKey &&
          (event as MouseEvent).button === 0
        ) {
          const target = event.target instanceof Element ? event.target : null;
          if (!target || !refined || !selected?.contains(target))
            select(pointerTarget(target));
          void hide();
        }
      };
      for (const type of [
        "pointerdown",
        "pointerup",
        "mousedown",
        "mouseup",
        "click",
        "dblclick",
        "auxclick",
        "dragstart",
        "contextmenu",
      ])
        window.addEventListener(type, intercept, { capture: true, signal });
    } catch (cause) {
      status =
        cause instanceof Error
          ? cause.message
          : "Could not start. Reload this page and try again.";
      error = true;
    } finally {
      busy = false;
      // Disabling the focused command during asynchronous registration can move
      // focus to the body. Restore it unless the user chose another page control.
      if (
        restoreFocus &&
        open &&
        revision === openRevision &&
        !profile.paused &&
        (document.activeElement === document.body ||
          (document.activeElement === uiHost &&
            (!uiHost?.shadowRoot?.activeElement ||
              uiHost?.shadowRoot?.activeElement?.id === "hide")))
      )
        focusSerial++;
      publish();
    }
  }
  async function hide() {
    if (!selected || busy || !picker) return;
    const selector = selectorFor(selected);
    if (!selector) {
      status = "Choose a smaller element.";
      error = true;
      publish();
      return;
    }
    const captureTarget = selected;
    const elementLabel = label(selected),
      session = picker;
    busy = true;
    status = "Saving…";
    error = false;
    publish();
    try {
      const summary = summarize(captureTarget);
      const preview = await capturePreview(captureTarget, [
        uiHost,
        highlightHost,
      ]);
      if (picker !== session) return;
      const result = await requestResult({
        type: "add",
        origin: location.origin,
        selector,
        label: elementLabel,
        preview,
        summary,
      });
      if (picker !== session) return;
      if (result.createdRuleId) sessionIds.push(result.createdRuleId);
      await rendering;
      if (picker !== session) return;
      if (!renderFailed) {
        status = profile.rules.some((rule) => rule.selector === selector)
          ? "Hidden."
          : "Restored.";
        error = false;
      }
      select(null);
    } catch {
      if (picker === session) {
        status = "Could not save. Try again.";
        error = true;
      }
    } finally {
      busy = false;
      publish();
    }
  }
  async function undo() {
    if (busy) return;
    const id = [...sessionIds]
      .reverse()
      .find((id) => profile.rules.some((rule) => rule.id === id));
    if (!id) return;
    const session = picker;
    busy = true;
    publish();
    try {
      await request({ type: "remove", origin: location.origin, id });
      await rendering;
      if (picker === session && !renderFailed) {
        status = "Restored.";
        error = false;
      }
    } catch {
      status = "Could not undo. Try again.";
      error = true;
    } finally {
      busy = false;
      publish();
    }
  }
  async function restore(id?: string) {
    if (busy) return;
    busy = true;
    status = "";
    error = false;
    publish();
    try {
      await request(
        id
          ? { type: "remove", origin: location.origin, id }
          : { type: "restore", origin: location.origin },
      );
      await rendering;
      if (!renderFailed)
        status = id ? "Element restored." : "Elements restored.";
      if (id) focusSerial++;
    } catch {
      status = "Could not restore. Try again.";
      error = true;
    } finally {
      busy = false;
      publish();
    }
  }
  async function setDarkMode(darkMode: boolean) {
    if (busy) return;
    busy = true;
    status = "";
    error = false;
    publish();
    try {
      await request({
        type: "set-dark-mode",
        origin: location.origin,
        darkMode,
      });
    } catch (cause) {
      status =
        cause instanceof Error ? cause.message : "Could not save dark mode.";
      error = true;
    } finally {
      busy = false;
      publish();
    }
  }
  async function setPaused(paused: boolean) {
    if (busy) return;
    busy = true;
    status = "";
    error = false;
    publish();
    try {
      await request({ type: "set-paused", origin: location.origin, paused });
      await rendering;
      if (!renderFailed)
        status = paused
          ? "Site paused. Saved rules are kept."
          : "Site resumed.";
    } catch (cause) {
      status =
        cause instanceof Error
          ? cause.message
          : "Could not update this site. Try again.";
      error = true;
    } finally {
      busy = false;
      publish();
    }
  }
  async function openAccessSettings() {
    try {
      const result = await chrome.runtime.sendMessage({
        type: "chrome-access",
        origin: location.origin,
      });
      if (result?.error) throw new Error(result.error);
    } catch {
      status = "Open Chrome’s extension settings to change site access.";
      error = true;
      publish();
    }
  }
  window.addEventListener(
    "keydown",
    (event) => {
      if (!event.isTrusted || !open) return;
      if (
        picker &&
        event.key === "Tab" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      )
        refined = false;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (picker) stop();
        else close();
        return;
      }
      if (
        !picker ||
        insideToolbar(event) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey
      )
        return;
      if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "ArrowUp") parent();
        if (event.key === "ArrowDown") child();
        if (event.key === "Enter") void hide();
      }
    },
    { capture: true },
  );
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (
      message.type === "profile" &&
      message.profile?.origin === location.origin
    ) {
      profileUpdates++;
      apply(message.profile);
    }
    if (message.type === "setup-failed") {
      status = "Site setup failed. Choose Hide to retry.";
      error = true;
      publish();
    }
    if (message.type === "access-denied") {
      status = "Use Chrome’s extension settings to allow access to this site.";
      error = true;
      publish();
    }
    if (message.type === "stop") {
      stop();
      reply({ active: false });
    }
    if (message.type === "get-picker")
      reply({
        active: !!picker,
        selector:
          message.selection === true && selected
            ? selectorFor(selected)
            : undefined,
      });
    if (message.type === "start") {
      void start().then(() => reply({ ok: true }));
      return true;
    }
  });
  publish();
  void request({ type: "get", origin: location.origin })
    .then((next) => {
      if (!profileUpdates) apply(next);
    })
    .catch(() => {});
  if (!document.documentElement)
    document.addEventListener("DOMContentLoaded", mountStyle, { once: true });
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setHost(host) {
      uiHost = host;
    },
    toggle,
    close,
    start,
    stop,
    hide,
    undo,
    parent,
    child,
    restore,
    setPaused,
    setDarkMode,
    openAccessSettings,
  };
}
