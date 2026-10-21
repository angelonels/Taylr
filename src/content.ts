import { request, requestResult, type SiteProfile } from "./model";
import { canSelect, selectorFor } from "./selector";
import panelCss from "./panel.css?inline";

const state = window as typeof window & { __taylr?: boolean };
if (!state.__taylr) {
  state.__taylr = true;
  initialize();
}

function initialize() {
  let profile: SiteProfile = { version: 1, origin: location.origin, rules: [] };
  let picker: AbortController | null = null;
  let selected: Element | null = null;
  let busy = false;
  let sessionIds: string[] = [];
  let previousCss = "";
  let rendering = Promise.resolve();
  let renderFailed = false;
  const host = document.createElement("taylr-tools");
  host.style.cssText =
    "all:initial!important;position:fixed!important;inset:0!important;z-index:2147483647!important;pointer-events:none!important;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `<style>${panelCss}</style><div class="highlight" hidden></div><section class="toolbar" aria-label="Taylr Hide"><div class="identity"><span class="mark" aria-hidden="true">t</span><div><strong>Hide</strong><p id="status" role="status" aria-live="polite">Click an element to hide it</p></div></div><div class="actions"><button id="undo" disabled>Undo</button><button id="done" class="primary">Done</button></div><p class="hint">↑ Parent · ↓ Child · Enter Hide · Esc Exit</p></section>`;
  const outline = root.querySelector<HTMLElement>(".highlight")!;
  const status = root.querySelector<HTMLElement>("#status")!;
  const undo = root.querySelector<HTMLButtonElement>("#undo")!;
  const style = document.createElement("style");
  style.dataset.taylr = "rules";
  const mount = () => {
    if (!style.isConnected) document.documentElement.append(style);
  };
  function apply(next: SiteProfile) {
    profile = next;
    mount();
    style.textContent = profile.rules
      .map((rule) => `${rule.selector} { display: none !important; }`)
      .join("\n");
    const css = style.textContent;
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
        status.textContent =
          "Saved, but could not update this page. Reload to try again.";
      });
    undo.disabled = !sessionIds.some((id) =>
      profile.rules.some((rule) => rule.id === id),
    );
  }
  void request({ type: "get", origin: location.origin })
    .then(apply)
    .catch(() => {});
  function select(element: Element | null) {
    selected =
      element && canSelect(element) && !host.contains(element) ? element : null;
    outline.hidden = !selected;
    if (!selected) return;
    const rect = selected.getBoundingClientRect();
    outline.style.transform = `translate(${rect.x}px, ${rect.y}px)`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
  }
  async function hide() {
    if (!selected || busy) return;
    const selector = selectorFor(selected);
    if (!selector) {
      status.textContent = "Choose a smaller element.";
      return;
    }
    busy = true;
    try {
      const result = await requestResult({
        type: "add",
        origin: location.origin,
        selector,
        label:
          selected.getAttribute("aria-label") ||
          selected.id ||
          selected.localName,
      });
      if (result.createdRuleId) sessionIds.push(result.createdRuleId);
      apply(result.profile);
      await rendering;
      if (!renderFailed) status.textContent = "Hidden. Saved for this site.";
      select(null);
    } catch {
      status.textContent = "Could not save. Click again to retry.";
    } finally {
      busy = false;
    }
  }
  function stop() {
    picker?.abort();
    picker = null;
    select(null);
    host.remove();
  }
  function start() {
    if (picker) return;
    picker = new AbortController();
    const signal = picker.signal;
    sessionIds = [];
    undo.disabled = true;
    status.textContent = "Click an element to hide it";
    document.documentElement.append(host);
    window.addEventListener(
      "focusin",
      (event) => {
        if (!event.composedPath().includes(host))
          select(event.target instanceof Element ? event.target : null);
      },
      { capture: true, signal },
    );
    window.addEventListener(
      "pointermove",
      (event) => {
        if (event.composedPath().includes(host)) return;
        select(event.target instanceof Element ? event.target : null);
      },
      { capture: true, signal },
    );
    const intercept = (event: Event) => {
      if (event.composedPath().includes(host)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === "click") {
        select(event.target instanceof Element ? event.target : null);
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
      "contextmenu",
    ])
      window.addEventListener(type, intercept, { capture: true, signal });
    window.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          stop();
          return;
        }
        if (event.composedPath().includes(host)) return;
        if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (event.key === "ArrowUp") select(selected?.parentElement ?? null);
          if (event.key === "ArrowDown")
            select(selected?.firstElementChild ?? null);
          if (event.key === "Enter") void hide();
        }
      },
      { capture: true, signal },
    );
    window.addEventListener("scroll", () => select(selected), {
      capture: true,
      signal,
    });
    window.addEventListener("resize", () => select(selected), { signal });
  }
  root.querySelector("#done")!.addEventListener("click", stop);
  undo.addEventListener("click", async () => {
    if (busy) return;
    const id = [...sessionIds]
      .reverse()
      .find((id) => profile.rules.some((rule) => rule.id === id));
    if (!id) return;
    busy = true;
    try {
      apply(await request({ type: "remove", origin: location.origin, id }));
      status.textContent = "Restored. Keep what matters.";
    } catch {
      status.textContent = "Could not undo. Try again.";
    } finally {
      busy = false;
    }
  });
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (
      message.type === "profile" &&
      message.profile?.origin === location.origin
    )
      apply(message.profile);
    if (message.type === "start") {
      start();
      reply({ ok: true });
    }
  });
}
