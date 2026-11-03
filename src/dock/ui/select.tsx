/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The UIArc styled non-modal listbox uses the ARIA select-only combobox pattern. */
// Adapted from UIArc Select, MIT © 2026 Elia Kuratli. See THIRD_PARTY_NOTICES.md.
// Native popovers keep the floating editor non-modal and leave the site's tree intact.
import { useRef, useState, type KeyboardEvent } from "react";
import { flushSync } from "react-dom";

export function Select({
  id,
  label,
  value,
  options,
  optionLabels,
  disabled,
  instant,
  onValueChange,
}: {
  id: string;
  label: string;
  value: string;
  options: readonly string[];
  optionLabels?: Readonly<Record<string, string>>;
  disabled?: boolean;
  instant: boolean;
  onValueChange: (value: string) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", time: 0 });
  const [open, setOpen] = useState(false);
  // Pressing the trigger light-dismisses this auto popover, and the toggle
  // event reporting it is asynchronous. A held press or busy CPU can deliver
  // it before the click, so the click must not read that as "was closed".
  const press = useRef({ active: false, wasOpen: false, closed: false });
  const values = [
    ...new Set(options.includes(value) ? options : [value, ...options]),
  ].filter(Boolean);
  const items = () => [
    ...menu.current!.querySelectorAll<HTMLElement>('[role="option"]'),
  ];
  function close(restore = true) {
    menu.current?.hidePopover();
    if (restore) trigger.current?.focus();
  }
  function show(index = Math.max(0, values.indexOf(value))) {
    const box = trigger.current!.getBoundingClientRect();
    const height = Math.min(300, innerHeight - 32);
    const width = Math.min(Math.max(box.width, 150), innerWidth - 32);
    Object.assign(menu.current!.style, {
      position: "fixed",
      margin: "0",
      width: `${width}px`,
      maxHeight: `${height}px`,
      left: `${Math.max(16, Math.min(box.left, innerWidth - width - 16))}px`,
      top: `${Math.max(16, Math.min(box.bottom + 6, innerHeight - Math.min(height, values.length * 36 + 14) - 16))}px`,
    });
    search.current = { text: "", time: 0 };
    flushSync(() => setOpen(true));
    menu.current!.showPopover();
    items()[index]?.focus();
  }
  function key(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Tab") {
      close();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    const list = items();
    const current = list.indexOf(
      menu.current!.getRootNode() instanceof ShadowRoot
        ? ((menu.current!.getRootNode() as ShadowRoot)
            .activeElement as HTMLElement)
        : (document.activeElement as HTMLElement),
    );
    if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      const next = values[current];
      if (next) {
        onValueChange(next);
        close();
      }
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? list.length - 1
            : Math.max(
                0,
                Math.min(
                  list.length - 1,
                  current + (event.key === "ArrowDown" ? 1 : -1),
                ),
              );
      list[next]?.focus();
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      event.preventDefault();
      const now = performance.now();
      const text =
        (now - search.current.time < 1000 ? search.current.text : "") +
        event.key.toLowerCase();
      search.current = { text, time: now };
      const query = /^([a-z0-9])\1*$/i.test(text) ? text[0]! : text;
      [
        ...list.slice(current + (query.length === 1 ? 1 : 0)),
        ...list.slice(0, current + 1),
      ]
        .find((item) =>
          item.textContent?.trim().toLowerCase().startsWith(query),
        )
        ?.focus();
    }
  }
  return (
    <>
      <button
        ref={trigger}
        type="button"
        id={id}
        aria-label={label}
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={`${id}-menu`}
        disabled={disabled}
        className="arc-select"
        onPointerDown={() => {
          press.current = {
            active: true,
            wasOpen: !!menu.current?.matches(":popover-open"),
            closed: false,
          };
        }}
        onClick={() => {
          const { active, wasOpen, closed } = press.current;
          press.current = { active: false, wasOpen: false, closed: false };
          if (active ? wasOpen || closed : open) close();
          else show();
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            show();
          }
        }}
      >
        <span>{optionLabels?.[value] ?? value}</span>
        <span aria-hidden="true">
          <svg viewBox="0 0 16 16" fill="none">
            <path
              d="m4 6 4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      <div
        ref={menu}
        id={`${id}-menu`}
        popover="auto"
        tabIndex={-1}
        role="listbox"
        aria-label={label}
        className="arc-select-menu"
        data-state={open ? "open" : "closed"}
        data-keyboard={instant}
        onToggle={(event) => {
          if (event.newState === "closed" && press.current.active)
            press.current.closed = true;
          setOpen(event.newState === "open");
        }}
        onKeyDown={key}
        onBlur={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            close(false);
        }}
      >
        {open &&
          values.map((option) => (
            <div
              key={option}
              role="option"
              tabIndex={-1}
              aria-selected={value === option}
              className="arc-select-option"
              data-value={option}
              data-state={value === option ? "checked" : "unchecked"}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  event.stopPropagation();
                  onValueChange(option);
                  close();
                }
              }}
              onClick={() => {
                onValueChange(option);
                close();
              }}
            >
              <span>{optionLabels?.[option] ?? option}</span>
              {value === option && <span aria-hidden="true">✓</span>}
            </div>
          ))}
      </div>
    </>
  );
}
