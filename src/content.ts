import { ElementEditor, TextEdits } from "./element-editor";
import { declarations } from "./edit-properties";
import {
  request,
  requestResult,
  RequestError,
  type SiteProfile,
  type Rule,
} from "./model";
import { capturePreview, componentText, summarize } from "./preview";
import { canSelect, selectorFor } from "./selector";
import type { Inspector, InspectorState } from "./inspector";
import { mountPageOverlay } from "./page-overlay";

if (!window.__taylr) window.__taylr = createInspector();

function createInspector(): Inspector {
  let profile: SiteProfile = { version: 1, origin: location.origin, rules: [] };
  let profileUpdates = 0;
  let open = false;
  let picker: AbortController | null = null;
  let selected: Element | null = null;
  let hovered: Element | null = null;
  let refined = false;
  let childHistory: Element[] = [];
  let frame = 0;
  let unmountHighlight: (() => void) | null = null;
  let busy = false;
  let sessionIds: string[] = [];
  const editor = new ElementEditor();
  const textEdits = new TextEdits();
  let mode: "hide" | "edit" = "hide";
  let operationHistory: (
    | { kind: "hide"; id: string }
    | { kind: "edit"; id: string; saved: Rule; before?: Rule }
  )[] = [];
  let status = "";
  let error = false;
  let focusSerial = 0;
  let openRevision = 0;
  let previousFocus: Element | null = null;
  let uiHost: HTMLElement | null = null;
  const captureSink = document.createElement("span");
  captureSink.setAttribute("aria-hidden", "true");
  captureSink.style.cssText =
    "pointer-events:none;position:fixed;width:0;height:0;";
  let gesture: {
    owner: AbortController;
    target: Element;
    x: number;
    y: number;
    id: number;
    canceled: boolean;
  } | null = null;
  let previousCss = "";
  // A failed render may have inserted its replacement before removing the old
  // sheet. Keep every uncertain string until a later render cleans it up.
  const pendingCss = new Set<string>();
  let rendering = Promise.resolve();
  let renderFailed = false;
  const listeners = new Set<() => void>();
  const highlightHost = document.createElement("taylr-highlight");
  highlightHost.style.cssText =
    "all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483646!important;";
  const shadow = highlightHost.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>:host{color-scheme:dark}.outline{position:fixed;inset:0 auto auto 0;box-sizing:border-box;border:2px solid #8abdff;background:rgba(10,100,218,.07);box-shadow:0 0 0 1px rgba(9,24,44,.55),0 0 18px rgba(10,100,218,.13);border-radius:6px;pointer-events:none}.outline[hidden]{display:none}</style><div class="outline" hidden></div>`;
  const outline = shadow.querySelector<HTMLElement>(".outline")!;
  const style = document.createElement("style");
  style.dataset.taylr = "rules";
  let snapshot: InspectorState;
  const visible = (element: Element | null): boolean =>
    !!element &&
    canSelect(element) &&
    element !== uiHost &&
    element !== highlightHost &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === "visible";
  const parentOf = () => {
    for (let node = selected?.parentElement; node; node = node.parentElement)
      if (visible(node)) return node;
    return null;
  };
  const childOf = () => {
    const remembered = childHistory.at(-1);
    if (remembered && selected?.contains(remembered) && visible(remembered)) {
      let ancestor = remembered.parentElement;
      while (ancestor && ancestor !== selected && !visible(ancestor))
        ancestor = ancestor.parentElement;
      if (ancestor === selected) return remembered;
    }
    // Semantic pointer promotion can select a link around several branches.
    // Follow the original hit unless explicit Parent/Child history chose another.
    if (hovered && selected?.contains(hovered)) {
      let branch: Element | null = null;
      for (
        let node: Element | null = hovered;
        node && node !== selected;
        node = node.parentElement
      )
        if (visible(node)) branch = node;
      if (branch) return branch;
    }
    const firstVisible = (elements: HTMLCollection): Element | null => {
      for (const element of elements) {
        if (visible(element)) return element;
        if (getComputedStyle(element).display === "contents") {
          const child = firstVisible(element.children);
          if (child) return child;
        }
      }
      return null;
    };
    return selected ? firstVisible(selected.children) : null;
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
      mode,
      editor: editor.state,
      editorDirty: editor.dirty,
      picking: !!picker,
      busy,
      profile,
      hasHidden: sessionIds.length > 0,
      canUndo:
        !editor.dirty &&
        operationHistory.some((entry) =>
          profile.rules.some((rule) => rule.id === entry.id),
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
  function apply(next: SiteProfile) {
    profile = next;
    if (profile.paused) stop();
    render();
    publish();
  }
  // Each rule is parsed alone and re-serialized by the browser. A malformed
  // selector or value cannot open a comment, string or block that swallows
  // later rules or styles the page; it is dropped instead.
  const scratch = new CSSStyleSheet();
  const serialized = new Map<string, string>();
  function contained(selector: string, body: string) {
    const key = `${selector}\u0000${body}`;
    let css = serialized.get(key);
    if (css === undefined) {
      try {
        scratch.replaceSync(`${selector} { ${body} }`);
        const [rule, ...rest] = scratch.cssRules;
        css = rule instanceof CSSStyleRule && !rest.length ? rule.cssText : "";
      } catch {
        css = "";
      }
      // Editor drafts add one entry per keystroke; bound the cache.
      if (serialized.size > 500) serialized.clear();
      serialized.set(key, css);
    }
    return css;
  }
  // Text follows the same containment as styles: a selector the stylesheet
  // drops must not still rewrite text through a lenient DOM query.
  const activeRules = () =>
    (profile.paused ? [] : profile.rules).filter(
      (rule) => contained(rule.selector, "") !== "",
    );
  function render() {
    mountStyle();
    const rules = activeRules();
    let css = rules
      .filter((rule) => rule.kind === "edit")
      .map((rule) => contained(rule.selector, declarations(rule.styles ?? {})))
      .join("\n");
    if (editor.target?.isConnected && !profile.paused)
      css += `\n${contained(editor.selector, declarations(editor.changes))}`;
    const hidden = rules
      .filter((rule) => rule.kind !== "edit")
      .map((rule) => contained(rule.selector, "display: none !important;"))
      .join("\n");
    // Important declarations in a layer outrank unlayered edits, even when an
    // older saved display rule has a more specific selector or was saved later.
    if (hidden.trim()) css += `\n@layer taylr-visibility { ${hidden} }`;
    textEdits.apply(
      rules,
      editor.target?.isConnected &&
        editor.changedText !== undefined &&
        !profile.paused
        ? { target: editor.target, text: editor.changedText }
        : undefined,
    );
    style.textContent = css;
    rendering = rendering
      .then(async () => {
        const result = await chrome.runtime.sendMessage({
          type: "render",
          previous: previousCss,
          pending: [...pendingCss],
          css,
        });
        if (result?.error) throw new Error(result.error);
        previousCss = css;
        pendingCss.clear();
        if (
          renderFailed &&
          status === "Could not update this page. Reload to try again."
        ) {
          status = "";
          error = false;
          publish();
        }
        renderFailed = false;
      })
      .catch(() => {
        // A failed acknowledgement can follow successful removal as well as
        // insertion. Neither the old nor desired stylesheet is known current.
        if (previousCss) pendingCss.add(previousCss);
        if (css) pendingCss.add(css);
        previousCss = "";
        renderFailed = true;
        status = "Could not update this page. Reload to try again.";
        error = true;
        publish();
      });
    publish();
  }
  function drawOutline() {
    cancelAnimationFrame(frame);
    frame = 0;
    if (!selected) return;
    if (!selected.isConnected) {
      const editing = !!editor.target;
      select(null);
      if (editing) {
        status = "This element changed. Pick it again.";
        error = false;
        publish();
      }
      return;
    }
    if (!visible(selected)) {
      if (editor.target === selected) {
        outline.hidden = true;
        frame = requestAnimationFrame(drawOutline);
      } else select(null);
      return;
    }
    outline.hidden = false;
    const rect = selected.getBoundingClientRect();
    outline.style.transform = `translate3d(${rect.x}px,${rect.y}px,0)`;
    outline.style.width = `${rect.width}px`;
    outline.style.height = `${rect.height}px`;
    frame = requestAnimationFrame(drawOutline);
  }
  function select(element: Element | null, preserve = false) {
    if (editor.target) {
      editor.clear();
      render();
    }
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
      element.closest(
        'button,a,[role="button"],[role="link"],input,select,textarea',
      ) ??
      element.closest("svg") ??
      element
    );
  }
  const captured = (event: Event) => event.composedPath().includes(captureSink);
  const insideToolbar = (event: Event) =>
    !!uiHost && event.composedPath().includes(uiHost) && !captured(event);
  const eventTarget = (event: Event) =>
    captured(event)
      ? (document.elementsFromPoint(
          (event as PointerEvent).clientX,
          (event as PointerEvent).clientY,
        )[0] ?? null)
      : event.target instanceof Element
        ? event.target
        : null;
  // Capture changes the eventual click target without covering the page. The
  // tail stays live after Escape so releasing a canceled press cannot open a link.
  for (const type of [
    "pointerup",
    "pointercancel",
    "lostpointercapture",
    "click",
    "auxclick",
  ]) {
    window.addEventListener(
      type,
      (event) => {
        if (!event.isTrusted || !captured(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        const down = gesture;
        gesture = null;
        if (
          event.type === "pointercancel" ||
          event.type === "lostpointercapture" ||
          event.type === "click" ||
          event.type === "auxclick"
        ) {
          return;
        }
        if (!down) return;
        const pointer = event as PointerEvent;
        const target = eventTarget(event);
        if (
          picker === down.owner &&
          !down.canceled &&
          !editor.target &&
          pointer.isTrusted &&
          pointer.pointerId === down.id &&
          pointer.button === 0 &&
          !pointer.ctrlKey &&
          !pointer.metaKey &&
          !pointer.altKey &&
          !pointer.shiftKey &&
          target &&
          down.target.isConnected &&
          down.target.contains(target) &&
          Math.hypot(pointer.clientX - down.x, pointer.clientY - down.y) <= 4
        ) {
          if (!refined || !selected?.contains(target))
            select(pointerTarget(target));
          if (mode === "hide") void hide();
          else lockEdit();
        }
      },
      { capture: true },
    );
  }
  function parent() {
    const next = parentOf();
    const editing = !!editor.target;
    if (next && selected) {
      childHistory.push(selected);
      select(next, true);
      if (mode === "edit" && editing) lockEdit();
    }
  }
  function child() {
    const next = childOf();
    const editing = !!editor.target;
    if (next) {
      childHistory.pop();
      select(next, true);
      if (mode === "edit" && editing) lockEdit();
    }
  }
  function stop() {
    if (gesture) gesture.canceled = true;
    if (editor.target) {
      editor.clear();
      render();
    }
    if (!picker) return;
    picker.abort();
    picker = null;
    hovered = null;
    select(null);
    unmountHighlight?.();
    unmountHighlight = null;
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
  async function start(nextMode: "hide" | "edit" = "hide") {
    if (busy || !open || profile.paused) return;
    if (picker && mode === nextMode) return;
    if (picker) stop();
    mode = nextMode;
    const revision = openRevision;
    const restoreFocus = ["hide", "edit", "start-hide", "start-edit"].includes(
      uiHost?.shadowRoot?.activeElement?.id ?? "",
    );
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
      operationHistory = [];
      unmountHighlight = mountPageOverlay(highlightHost);
      notify();
      window.addEventListener(
        "focusin",
        (event) => {
          // Site focus managers also create trusted focus events. Preserve an
          // explicit Parent/Child choice until pointer input or native Tab.
          if (
            event.isTrusted &&
            !refined &&
            !editor.target &&
            !insideToolbar(event)
          ) {
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
          if (
            gesture &&
            Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 4
          )
            gesture.canceled = true;
          if (editor.target) return;
          (uiHost?.shadowRoot?.activeElement as HTMLElement | null)?.blur();
          const target = eventTarget(event);
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
        const target = eventTarget(event);
        const pointer = event as PointerEvent;
        if (
          event.type === "pointerdown" &&
          pointer.isTrusted &&
          target &&
          picker
        ) {
          gesture = {
            owner: picker,
            // The selected component can survive replacement of its inner
            // glyph during the page's earlier pointerdown handler. The event
            // path retains that boundary even after its raw hit is detached.
            target:
              selected?.isConnected && event.composedPath().includes(selected)
                ? selected
                : (pointerTarget(target) ?? target),
            x: pointer.clientX,
            y: pointer.clientY,
            id: pointer.pointerId,
            canceled:
              pointer.button !== 0 ||
              !pointer.isPrimary ||
              pointer.ctrlKey ||
              pointer.metaKey ||
              pointer.altKey ||
              pointer.shiftKey,
          };
          try {
            captureSink.setPointerCapture(pointer.pointerId);
          } catch {
            // Pointer lock or a detached host can reject capture; do not commit.
            gesture.canceled = true;
          }
        }
        // Locked edits still shield pointer clicks from site activation. Native
        // keyboard activation follows the focused page control, not the picker.
        if (
          editor.target &&
          event.type === "click" &&
          (event as MouseEvent).detail === 0
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (
          event.type === "click" &&
          !editor.target &&
          event.isTrusted &&
          !(event as MouseEvent).ctrlKey &&
          !(event as MouseEvent).metaKey &&
          !(event as MouseEvent).altKey &&
          !(event as MouseEvent).shiftKey &&
          (event as MouseEvent).button === 0
        ) {
          // Pointer gestures commit on captured pointerup. Keep keyboard-driven
          // clicks on the existing keyboard selection path only.
          if ((event as MouseEvent).detail > 0) return;
          if (!target || !refined || !selected?.contains(target))
            select(pointerTarget(target));
          if (mode === "hide") void hide();
          else lockEdit();
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
              ["hide", "edit"].includes(
                uiHost?.shadowRoot?.activeElement?.id ?? "",
              ))))
      )
        focusSerial++;
      publish();
    }
  }
  function lockEdit() {
    if (!selected || busy || editor.target) return;
    const existing = [...profile.rules].reverse().find((rule) => {
      if (rule.kind !== "edit") return false;
      try {
        const matches = document.querySelectorAll(rule.selector);
        return matches.length === 1 && matches[0] === selected;
      } catch {
        return false;
      }
    });
    const selector = existing?.selector ?? selectorFor(selected);
    if (!selector) {
      status = "Choose a smaller element.";
      error = true;
      publish();
      return;
    }
    editor.begin(selected, selector, existing?.styles);
    focusSerial++;
    refined = true;
    publish();
  }
  function editStyle(key: string, value: string) {
    if (busy || !editor.target) return;
    editor.set(key, value);
    render();
  }
  function editText(value: string) {
    if (busy || editor.text === null || value.length > 5000) return;
    editor.text = value;
    render();
  }
  function resetStyle(key: string) {
    if (busy || !editor.target) return;
    editor.reset(key);
    render();
  }
  function pickAgain() {
    if (busy) return;
    editor.clear();
    select(null);
    hovered = null;
    render();
  }
  async function saveEdit() {
    const target = editor.target;
    if (
      busy ||
      !target?.isConnected ||
      !editor.dirty ||
      editor.invalid.size ||
      !picker
    )
      return false;
    const session = picker;
    const selector = editor.selector;
    busy = true;
    error = false;
    status = "Saving…";
    publish();
    try {
      const result = await requestResult({
        type: "edit",
        origin: location.origin,
        selector,
        label: label(target),
        styles: { ...editor.changes },
        ...(editor.changedText !== undefined
          ? { text: editor.changedText }
          : {}),
      });
      if (result.savedRule) {
        operationHistory.push({
          kind: "edit",
          id: result.savedRule.id,
          saved: result.savedRule,
          before: result.previousRule,
        });
      }
      if (session !== picker) return false;
      // Keep the inspector mounted through commit so pending focus and feedback survive.
      render();
      await rendering;
      if (session !== picker) return false;
      // A page can hide or replace the target during the write. The committed
      // edit is clean either way, so it must not keep Undo locked behind a draft.
      if (target.isConnected)
        editor.begin(
          target,
          result.savedRule?.selector || selector,
          result.savedRule?.styles,
        );
      else editor.clear();
      if (renderFailed) return false;
      status = "Changes saved.";
      return true;
    } catch (cause) {
      // A cross-tab Pause ends picking before a queued Save can reject. Keep
      // that rejection visible, while unrelated newer editor sessions stay safe.
      if (session !== picker && !profile.paused) return false;
      status =
        cause instanceof Error ? cause.message : "Could not save changes.";
      error = true;
      return false;
    } finally {
      busy = false;
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
    if (editor.target) {
      editor.clear();
      render();
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
      if (result.createdRuleId) {
        sessionIds.push(result.createdRuleId);
        operationHistory.push({ kind: "hide", id: result.createdRuleId });
      }
      // Escape can end selection after dispatch, but a committed Hide still
      // belongs to Undo. Cancellation before dispatch remains mutation-free.
      if (picker !== session) return;
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
    if (busy || editor.dirty) return;
    // Restore may remove a rule in this tab or another tab. Its vanished
    // history cannot prevent Undo from reaching the preceding live operation.
    operationHistory = operationHistory.filter((entry) =>
      profile.rules.some((rule) => rule.id === entry.id),
    );
    const entry = operationHistory.at(-1);
    if (entry?.kind === "edit") {
      busy = true;
      publish();
      try {
        await request({
          type: "undo-edit",
          origin: location.origin,
          id: entry.saved.id,
          revision: entry.saved.revision!,
          before: entry.before,
        });
        operationHistory.pop();
        if (editor.target && editor.selector === entry.saved.selector) {
          editor.clear();
          render();
        }
        await rendering;
        if (!renderFailed) {
          status = "Changes undone.";
          error = false;
        }
      } catch (cause) {
        // A newer writer owns every local revision of this rule. Discard only
        // that stale history; transient failures must remain retryable.
        if (cause instanceof RequestError && cause.code === "revision-conflict")
          operationHistory = operationHistory.filter(
            (operation) => operation.id !== entry.id,
          );
        status = cause instanceof Error ? cause.message : "Could not undo.";
        error = true;
      } finally {
        busy = false;
        publish();
      }
      return;
    }
    const id = entry?.id;
    if (!id) return;
    const session = picker;
    busy = true;
    publish();
    try {
      await request({ type: "remove", origin: location.origin, id });
      operationHistory.pop();
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
  async function setPaused(paused: boolean) {
    if (busy) return;
    busy = true;
    status = "";
    error = false;
    publish();
    try {
      await request({ type: "set-paused", origin: location.origin, paused });
      await rendering;
      if (!renderFailed && profile.paused === paused)
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
        if (
          insideToolbar(event) &&
          uiHost?.shadowRoot?.querySelector(
            '[popover]:popover-open, [role="listbox"][data-state="open"]',
          )
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (picker) stop();
        else close();
        return;
      }
      if (
        !picker ||
        editor.target ||
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
        if (event.key === "Enter") {
          if (mode === "edit") lockEdit();
          else void hide();
        }
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
  function reapplyText() {
    if (
      profile.rules.some(
        (rule) => rule.kind === "edit" && rule.text !== undefined,
      ) ||
      editor.changedText !== undefined
    )
      if (
        textEdits.apply(
          activeRules(),
          editor.target?.isConnected &&
            editor.changedText !== undefined &&
            !profile.paused
            ? { target: editor.target, text: editor.changedText }
            : undefined,
        )
      ) {
        status =
          "This page keeps replacing edited text. Text updates paused until reload.";
        error = true;
        publish();
      }
  }
  const textObserver = new MutationObserver(reapplyText);
  // The last parsed element closes without a further mutation. Window capture
  // runs before page listeners can stop propagation.
  window.addEventListener("DOMContentLoaded", reapplyText, {
    capture: true,
    once: true,
  });
  textObserver.observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
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
      host.shadowRoot?.append(captureSink);
    },
    toggle,
    close,
    start,
    editStyle,
    editText,
    resetStyle,
    saveEdit,
    pickAgain,
    stop,
    hide,
    undo,
    parent,
    child,
    restore,
    setPaused,
    openAccessSettings,
  };
}
