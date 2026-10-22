import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type ComponentProps,
} from "react";
import { createRoot } from "react-dom/client";
import { motion } from "motion/react";
import type { Inspector } from "./inspector";
import { ComponentPreview } from "./dock/component-preview";
import { usePosition } from "./dock/use-position";
import css from "./tailwind.css?inline";

function Icon({
  name,
}: {
  name:
    | "hide"
    | "undo"
    | "rules"
    | "close"
    | "up"
    | "down"
    | "grip"
    | "restore"
    | "site"
    | "moon";
}) {
  const paths = {
    moon: "M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z",
    site: "M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7l-9-4Z",
    hide: "M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5M8 12h8",
    undo: "M9 5 4 10l5 5M4 10h9a6 6 0 0 1 0 12",
    rules: "M8 5h12M8 12h12M8 19h12M3 5h.01M3 12h.01M3 19h.01",
    close: "m6 6 12 12M6 18 18 6",
    up: "m6 12 6-6 6 6M12 6v14",
    down: "m6 12 6 6 6-6M12 4v14",
    grip: "M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01",
    restore: "M4 5v6h6M4 11a8 8 0 1 1 2 7",
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "grip" ? 3 : 1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function Tool({
  label,
  children,
  ...props
}: ComponentProps<"button"> & { label: string; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
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
  const [keyboard, setKeyboard] = useState(false);
  const hideRef = useRef<HTMLButtonElement>(null),
    rulesRef = useRef<HTMLButtonElement>(null);
  const { ref: positionRef, ...position } = usePosition(state.open);
  const previousFocusSerial = useRef(state.focusSerial);
  useEffect(() => {
    if (state.open) {
      if (!host.matches(":popover-open")) host.showPopover();
      (hideRef.current?.disabled
        ? host.shadowRoot?.querySelector<HTMLElement>("#site-toggle")
        : hideRef.current
      )?.focus({ preventScroll: true });
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
      (rulesOpen ? rulesRef : hideRef).current?.focus({ preventScroll: true });
    }
  }, [state.focusSerial, state.busy, rulesOpen]);
  if (!state.open) return null;
  const rules = state.profile.rules;
  const details = state.picking || rulesOpen || siteOpen || state.error;
  return (
    <motion.div
      ref={positionRef}
      className="dock"
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
            title="Drag to move · click to switch edge · arrow keys to move · Home to reset"
            {...position.grip}
          >
            <Icon name="grip" />
          </Tool>
          <span className="site min-w-0 flex-1">
            <strong title={location.hostname}>{location.hostname}</strong>
            <small>
              {chrome.extension.inIncognitoContext ? "Private · " : ""}
              {state.profile.paused
                ? "Taylr · Paused"
                : rules.length
                  ? `Taylr · ${rules.length} hidden`
                  : "Taylr"}
            </small>
          </span>
          <Tool
            id="close"
            label="Close Taylr"
            onClick={() => inspector.close()}
          >
            <Icon name="close" />
          </Tool>
        </div>
        <button
          id="hide"
          ref={hideRef}
          type="button"
          className="primary flex items-center justify-center gap-2"
          aria-pressed={state.picking}
          aria-busy={state.busy}
          disabled={state.busy || state.profile.paused}
          onClick={() => {
            setRulesOpen(false);
            setSiteOpen(false);
            if (state.picking) inspector.stop();
            else void inspector.start();
          }}
        >
          <Icon name="hide" />
          <span>{state.picking ? "Picking" : "Hide"}</span>
        </button>
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
          disabled={state.busy || state.profile.paused}
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
                  error: "Retry",
                }[state.themeStatus]}
          </span>
        </Tool>
        <Tool
          id="rules-toggle"
          ref={rulesRef}
          label="Rules"
          aria-expanded={rulesOpen}
          aria-controls="taylr-rules"
          onClick={() => {
            if (state.picking) inspector.stop();
            setSiteOpen(false);
            setRulesOpen(!rulesOpen);
          }}
        >
          <Icon name="rules" />
          <span>Rules</span>
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
        </Tool>
      </div>
      {details && (
        <div className="details">
          {siteOpen && (
            <section id="taylr-site" aria-label="Site access">
              <h2>{state.profile.paused ? "Site paused" : "Site active"}</h2>
              <p className="empty">
                {state.profile.paused
                  ? "Taylr stops hiding and recoloring here. Saved settings are kept."
                  : "Pause Taylr on this site to reveal hidden elements and restore the site’s colors."}
              </p>
              <button
                id="site-pause"
                type="button"
                disabled={state.busy}
                onClick={() => void inspector.setPaused(!state.profile.paused)}
              >
                {state.profile.paused ? "Resume site" : "Pause site"}
              </button>
              <p className="empty">
                Pause controls Taylr. Change browser permissions in Chrome’s
                site access settings.
              </p>
              <button
                id="chrome-access"
                type="button"
                onClick={() => void inspector.openAccessSettings()}
              >
                Chrome access settings
              </button>
            </section>
          )}
          {state.picking && (
            <section aria-label="Taylr Hide" className="inspector">
              <div className="flex items-center justify-between gap-3">
                <span className="mode">
                  <span />
                  Hide elements
                </span>
                <button
                  type="button"
                  id={state.hasHidden ? "done" : "cancel"}
                  aria-label={state.hasHidden ? "Done" : "Cancel"}
                  onClick={() => inspector.stop()}
                >
                  {state.hasHidden ? "Done" : "Cancel"}
                  <kbd>esc</kbd>
                </button>
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
            <section id="taylr-rules" aria-label="Hidden elements">
              <div className="rules-heading flex items-center justify-between gap-3">
                <h2>
                  {rules.length
                    ? `${rules.length} ${state.profile.paused ? "saved" : "hidden"}`
                    : "Nothing hidden"}
                </h2>
                <button
                  type="button"
                  id="restore"
                  disabled={!rules.length || state.busy}
                  onClick={() => void inspector.restore()}
                >
                  Restore all
                </button>
              </div>
              {!rules.length && (
                <p className="empty">
                  Choose Hide, then select an element on the page. Its rule will
                  appear here.
                </p>
              )}
              <ul id="rules" className="m-0 list-none p-0">
                {rules.map((rule) => (
                  <li key={rule.id} className="rule">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="rule-label min-w-0 flex-1">
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
    document.documentElement.append(host);
    inspector.setHost(host);
    createRoot(mount).render(<Dock inspector={inspector} host={host} />);
  }
}
