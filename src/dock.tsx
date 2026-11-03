import logo from "../assets/taylr-mark.png?inline";
import { Button } from "./dock/ui/button";
import { Icon } from "./dock/icon";
import { StartPanel } from "./dock/start-panel";
import { EditPanel } from "./dock/edit-panel";
import { mountPageOverlay } from "./page-overlay";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type ComponentProps,
} from "react";
import { createRoot } from "react-dom/client";
import { motion, useReducedMotion } from "motion/react";
import type { Inspector } from "./inspector";
import { ComponentPreview } from "./dock/component-preview";
import { usePosition } from "./dock/use-position";
import css from "./tailwind.css?inline";

function Tool({
  label,
  children,
  ...props
}: ComponentProps<typeof Button> & { label: string; children: ReactNode }) {
  return (
    <Button type="button" aria-label={label} title={label} {...props}>
      {children}
    </Button>
  );
}
function focusStart(host: HTMLElement) {
  const root = host.shadowRoot;
  const home = root?.querySelector<HTMLElement>("#start-edit, #resume-site");
  (home?.getClientRects().length
    ? home
    : root?.querySelector<HTMLElement>("#edit:not(:disabled), #site-toggle")
  )?.focus({ preventScroll: true });
}
function Dock({
  inspector,
  host,
}: {
  inspector: Inspector;
  host: HTMLElement;
}) {
  const state = useSyncExternalStore(
    inspector.subscribe,
    inspector.getSnapshot,
  );
  const [rulesOpen, setRulesOpen] = useState(false);
  const [siteOpen, setSiteOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const reduced = useReducedMotion();
  const selectionMotion =
    reduced || keyboard
      ? { duration: 0 }
      : { type: "spring" as const, stiffness: 520, damping: 44 };
  const editRef = useRef<HTMLButtonElement>(null),
    hideRef = useRef<HTMLButtonElement>(null),
    rulesRef = useRef<HTMLButtonElement>(null);
  const { ref: positionRef, ...position } = usePosition(state.open);
  const previousFocusSerial = useRef(state.focusSerial);
  const returnFocus = useRef("#start-edit");
  useEffect(() => {
    if (state.open) {
      const unmount = mountPageOverlay(host);
      focusStart(host);
      return unmount;
    } else {
      if (host.matches(":popover-open")) host.hidePopover();
      // Synchronize disclosure state with the external inspector closing.
      // oxlint-disable-next-line react/set-state-in-effect
      setRulesOpen(false);
      setSiteOpen(false);
    }
  }, [state.open, host]);
  useEffect(() => {
    if (previousFocusSerial.current !== state.focusSerial && !state.busy) {
      previousFocusSerial.current = state.focusSerial;
      if (rulesOpen) rulesRef.current?.focus({ preventScroll: true });
      else if (state.picking && state.editor)
        host.shadowRoot
          ?.querySelector<HTMLElement>("#edit-text, #edit-color")
          ?.focus({ preventScroll: true });
      else if (state.picking)
        (state.mode === "edit" ? editRef : hideRef).current?.focus({
          preventScroll: true,
        });
      else {
        const origin = host.shadowRoot?.querySelector<HTMLElement>(
          returnFocus.current,
        );
        if (origin?.getClientRects().length)
          origin.focus({ preventScroll: true });
        else focusStart(host);
      }
    }
  }, [
    state.focusSerial,
    state.busy,
    state.picking,
    state.mode,
    state.editor,
    rulesOpen,
    host,
  ]);
  if (!state.open) return null;
  const rules = state.profile.rules;
  const details = state.picking || rulesOpen || siteOpen || state.error;
  return (
    <motion.div
      ref={positionRef}
      className="dock"
      data-compact={compact}
      data-editing={state.picking && state.mode === "edit"}
      data-dragging={position.dragging}
      data-keyboard={keyboard}
      style={{ transform: position.transform }}
      onPointerDownCapture={() => setKeyboard(false)}
      onKeyDownCapture={() => setKeyboard(true)}
      onClickCapture={(event) => {
        if (!event.nativeEvent.isTrusted) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      <div
        className="bar flex flex-col gap-1"
        role="toolbar"
        aria-label="Taylr"
        aria-orientation="vertical"
      >
        <div className="panel-header flex items-center gap-1">
          <Tool
            id="move"
            label="Move toolbar"
            className="grip"
            variant="ghost"
            title="Drag to move · click to switch edge · arrow keys to move · Home to reset"
            {...position.grip}
          >
            <Icon name="grip" />
          </Tool>
          <span className="brand-mark" aria-hidden="true">
            <img src={logo} alt="" />
          </span>
          <span className="site min-w-0 flex-1">
            <strong className="brand">Taylr</strong>
            <span className="site-name" title={location.hostname}>
              {location.hostname}
            </span>
            <small>
              {chrome.extension.inIncognitoContext ? "Private · " : ""}
              {state.profile.paused
                ? "Paused"
                : rules.length
                  ? `${rules.length} ${rules.some((rule) => rule.kind === "edit") ? (rules.length === 1 ? "edit" : "edits") : "hidden"}`
                  : "Site active"}
            </small>
          </span>
          <Tool
            id="fold"
            label={compact ? "Expand panel" : "Fold panel"}
            aria-pressed={compact}
            onClick={() => setCompact(!compact)}
          >
            <Icon name="fold" />
          </Tool>
          <Tool
            id="close"
            label="Close Taylr"
            onClick={() => inspector.close()}
          >
            <Icon name="close" />
          </Tool>
        </div>
        <div className="tools">
          <Tool
            id="edit"
            ref={editRef}
            label="Edit"
            aria-pressed={state.picking && state.mode === "edit"}
            disabled={state.busy || state.profile.paused}
            onClick={() => {
              setRulesOpen(false);
              setSiteOpen(false);
              setCompact(false);
              returnFocus.current = "#edit";
              if (state.picking && state.mode === "edit") inspector.stop();
              else void inspector.start("edit");
            }}
          >
            {state.picking && state.mode === "edit" && (
              <motion.span
                layoutId="tool-selection"
                className="tool-selection"
                transition={selectionMotion}
                aria-hidden="true"
              />
            )}
            <Icon name="edit" />
            <span>Edit</span>
          </Tool>
          <Button
            id="hide"
            ref={hideRef}
            type="button"
            className="primary flex items-center justify-center gap-2"
            aria-pressed={state.picking && state.mode === "hide"}
            aria-busy={state.busy}
            disabled={state.busy || state.profile.paused}
            onClick={() => {
              setRulesOpen(false);
              setSiteOpen(false);
              returnFocus.current = "#hide";
              if (state.picking && state.mode === "hide") inspector.stop();
              else void inspector.start();
            }}
          >
            {state.picking && state.mode === "hide" && (
              <motion.span
                layoutId="tool-selection"
                className="tool-selection"
                transition={selectionMotion}
                aria-hidden="true"
              />
            )}
            <Icon name="hide" />
            <span>
              {state.picking && state.mode === "hide" ? "Picking" : "Hide"}
            </span>
          </Button>
          <Tool
            id="undo"
            label="Undo"
            disabled={state.busy || !state.canUndo}
            onClick={() => void inspector.undo()}
          >
            <Icon name="undo" />
            <span>Undo</span>
          </Tool>
          <Tool
            id="dark-mode"
            label="Dark mode"
            aria-pressed={!!state.profile.darkMode}
            aria-busy={state.themeStatus === "applying"}
            // aria-disabled keeps keyboard focus through a slow save; the
            // inspector ignores toggles while busy.
            aria-disabled={state.busy || !!state.profile.paused}
            disabled={!!state.profile.paused}
            onClick={() => void inspector.setDarkMode(!state.profile.darkMode)}
          >
            <Icon name="moon" />
            <span>Dark mode</span>
            <span className="count">
              {state.profile.paused
                ? "Paused"
                : {
                    off: "Off",
                    on: "On",
                    applying: "Applying…",
                    "forced-colors": "System colors",
                    external: "Other theme",
                    error: "Error",
                  }[state.themeStatus]}
            </span>
          </Tool>
          <Tool
            id="rules-toggle"
            ref={rulesRef}
            label="Edits"
            aria-expanded={rulesOpen}
            aria-controls="taylr-rules"
            onClick={() => {
              if (state.picking) inspector.stop();
              setSiteOpen(false);
              setRulesOpen(!rulesOpen);
            }}
          >
            <Icon name="rules" />
            <span>Edits</span>
            {rules.length > 0 && <span className="count">{rules.length}</span>}
          </Tool>
          <Tool
            id="site-toggle"
            label="Site"
            aria-expanded={siteOpen}
            aria-controls="taylr-site"
            onClick={() => {
              if (state.picking) inspector.stop();
              setRulesOpen(false);
              setSiteOpen(!siteOpen);
            }}
          >
            <Icon name="site" />
            <span>Site</span>
            <span
              className="site-state"
              data-paused={state.profile.paused}
              aria-hidden="true"
            />
          </Tool>
        </div>
      </div>
      {!details && (
        <StartPanel
          paused={!!state.profile.paused}
          count={rules.length}
          onEdit={() => {
            setCompact(false);
            returnFocus.current = "#start-edit";
            void inspector.start("edit");
          }}
          onHide={() => {
            setCompact(false);
            returnFocus.current = "#start-hide";
            void inspector.start("hide");
          }}
          onEdits={() => {
            setCompact(false);
            setRulesOpen(true);
          }}
          onResume={() => void inspector.setPaused(false)}
        />
      )}
      {details && (
        <div className="details">
          {siteOpen && (
            <section id="taylr-site" aria-label="Site access">
              <h2>{state.profile.paused ? "Site paused" : "Site active"}</h2>
              <p className="empty">
                {state.profile.paused
                  ? "Taylr stops editing, hiding and recoloring here. Saved edits are kept."
                  : "Pause this site to restore its appearance and stop selection."}
              </p>
              <Button
                id="site-pause"
                type="button"
                disabled={state.busy}
                onClick={() => void inspector.setPaused(!state.profile.paused)}
              >
                {state.profile.paused ? "Resume site" : "Pause site"}
              </Button>
              <p className="empty">
                Pause controls Taylr. Change browser permissions in Chrome’s
                site access settings.
              </p>
              <Button
                id="chrome-access"
                type="button"
                onClick={() => void inspector.openAccessSettings()}
              >
                Chrome access settings
              </Button>
            </section>
          )}
          {state.picking && state.mode === "edit" && (
            <EditPanel inspector={inspector} state={state} instant={keyboard} />
          )}
          {state.picking && state.mode === "hide" && (
            <section aria-label="Taylr Hide" className="inspector">
              <div className="flex items-center justify-between gap-3">
                <span className="mode">
                  <span />
                  Hide elements
                </span>
                <Button
                  type="button"
                  id={state.hasHidden ? "done" : "cancel"}
                  aria-label={state.hasHidden ? "Done" : "Cancel"}
                  onClick={() => inspector.stop()}
                >
                  {state.hasHidden ? "Done" : "Cancel"}
                  <kbd>esc</kbd>
                </Button>
              </div>
              <div className="selection flex items-center gap-2">
                <Tool
                  id="parent"
                  label="Select parent"
                  disabled={state.busy || !state.selection?.parent}
                  onClick={() => inspector.parent()}
                >
                  <Icon name="up" />
                </Tool>
                <Tool
                  id="child"
                  label="Select child"
                  disabled={state.busy || !state.selection?.child}
                  onClick={() => inspector.child()}
                >
                  <Icon name="down" />
                </Tool>
                <span id="selection-text" className="min-w-0 flex-1">
                  {state.selection?.label ?? "Choose an element on the page"}
                </span>
                <Tool
                  id="hide-selection"
                  label="Hide selected element"
                  className="hide-selection"
                  disabled={state.busy || !state.selection}
                  onClick={() => void inspector.hide()}
                >
                  <Icon name="hide" />
                </Tool>
              </div>
              <p className="hint">
                <span>
                  <kbd>↑</kbd>
                  <kbd>↓</kbd> Select size
                </span>
                <span>
                  <kbd>↵</kbd> Hide
                </span>
              </p>
            </section>
          )}
          {rulesOpen && (
            <section id="taylr-rules" aria-label="Saved edits">
              <div className="rules-heading flex items-center justify-between gap-3">
                <h2>
                  {rules.length
                    ? `${rules.length} ${rules.length === 1 ? "edit" : "edits"}`
                    : "No edits yet"}
                </h2>
                <Button
                  type="button"
                  id="restore"
                  disabled={!rules.length || state.busy}
                  onClick={() => void inspector.restore()}
                >
                  Restore all
                </Button>
              </div>
              {!rules.length && (
                <p className="empty">Saved changes appear here.</p>
              )}
              <ul id="rules" className="m-0 list-none p-0">
                {rules.map((rule) => (
                  <li key={rule.id} className="rule">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="rule-label min-w-0 flex-1">
                        {rule.kind === "edit" && (
                          <small className="rule-kind">Edited</small>
                        )}
                        {rule.label}
                      </span>
                      <Tool
                        label={`Restore ${rule.label}`}
                        disabled={state.busy}
                        onClick={() => void inspector.restore(rule.id)}
                      >
                        <Icon name="restore" />
                        <span>Restore</span>
                      </Tool>
                    </div>
                    <ComponentPreview rule={rule} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {state.status && (
            <output
              id="status"
              className="status"
              aria-live="polite"
              data-error={state.error}
            >
              {state.status}
            </output>
          )}
        </div>
      )}
    </motion.div>
  );
}
const inspector = window.__taylr;
if (inspector) {
  if (!window.__taylrDock) {
    window.__taylrDock = true;
    const host = document.createElement("taylr-tools");
    host.setAttribute("popover", "manual");
    host.style.cssText =
      "all:initial!important;position:fixed!important;inset:0!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;max-width:none!important;max-height:none!important;width:auto!important;height:auto!important;pointer-events:none!important;overflow:visible!important;z-index:2147483647!important;";
    const root = host.attachShadow({ mode: "open" });
    const stylesheet = document.createElement("style");
    // Keep our isolated operational UI outside the page recoloring engine.
    stylesheet.className = "darkreader";
    stylesheet.textContent = css;
    root.append(stylesheet);
    const mount = document.createElement("div");
    root.append(mount);
    for (const type of [
      "click",
      "pointerdown",
      "pointerup",
      "keydown",
      "input",
      "change",
    ])
      root.addEventListener(
        type,
        (event) => {
          if (!event.isTrusted) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        { capture: true },
      );
    // React handles events inside the mount before this boundary. Keep panel
    // shortcuts and edits from reaching the website's document/window handlers.
    for (const type of [
      "click",
      "dblclick",
      "pointerdown",
      "pointerup",
      "keydown",
      "keyup",
      "input",
      "change",
      "contextmenu",
    ])
      root.addEventListener(type, (event) => event.stopPropagation());
    document.documentElement.append(host);
    inspector.setHost(host);
    createRoot(mount).render(<Dock inspector={inspector} host={host} />);
  }
}
