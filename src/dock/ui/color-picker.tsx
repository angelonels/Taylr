/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions -- Non-modal native dialog handles Escape dismissal and focus restoration. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The two-axis saturation/brightness thumb has no native input equivalent. */
// Adapted from UIArc ColorPicker, MIT © 2026 Elia Kuratli. See THIRD_PARTY_NOTICES.md.
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Button } from "./button";
type Hsva = { h: number; s: number; v: number; a: number };
type Rgba = { r: number; g: number; b: number; a: number };

const clamp = (value: number, min = 0, max = 1) =>
  Math.min(max, Math.max(min, value));
/* Color math. sRGB channels are 0 to 1. */
function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return { r: f(5), g: f(3), b: f(1), a };
}
function rgbToHsv({ r, g, b, a }: Rgba, hue = 0): Hsva {
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  let h = hue;
  if (d > 1e-6) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max, a };
}
function hslToRgb(h: number, s: number, l: number, a: number): Rgba {
  const k = (n: number) => (n + h / 30) % 12,
    c = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - c * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return { r: f(0), g: f(8), b: f(4), a };
}
const fromLinear = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
function oklchToRgb(L: number, C: number, H: number, a: number): Rgba {
  const A = C * Math.cos((H * Math.PI) / 180),
    B = C * Math.sin((H * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return {
    r: clamp(
      fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    ),
    g: clamp(
      fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    ),
    b: clamp(
      fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ),
    a,
  };
}
const byte = (c: number) => Math.round(clamp(c) * 255);
const hex2 = (c: number) => byte(c).toString(16).padStart(2, "0").toUpperCase();

function toHex(hsva: Hsva) {
  const { r, g, b, a } = hsvToRgb(hsva);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${a < 0.999 ? hex2(a) : ""}`;
}
const readAlpha = (text?: string) =>
  text === undefined
    ? 1
    : text.endsWith("%")
      ? clamp(parseFloat(text) / 100)
      : clamp(parseFloat(text));

/** Reads hex, rgb(), hsl(), and oklch() in modern or comma syntax. Returns null for anything else. */
function parseColor(input: string, hue = 0): Hsva | null {
  const text = input.trim().toLowerCase();
  let match = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(text);
  if (match) {
    let digits = match[1]!;
    if (digits.length <= 4)
      digits = digits
        .split("")
        .map((d) => d + d)
        .join("");
    const n = (i: number) => parseInt(digits.slice(i, i + 2), 16) / 255;
    return rgbToHsv(
      { r: n(0), g: n(2), b: n(4), a: digits.length === 8 ? n(6) : 1 },
      hue,
    );
  }
  match =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(
      text,
    );
  if (match)
    return rgbToHsv(
      {
        r: clamp(+match[1]! / 255),
        g: clamp(+match[2]! / 255),
        b: clamp(+match[3]! / 255),
        a: readAlpha(match[4]),
      },
      hue,
    );
  match =
    /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?(?:\s*[/,]\s*([\d.]+%?))?\s*\)$/.exec(
      text,
    );
  if (match) {
    const h = +match[1]! % 360;
    const next = rgbToHsv(
      hslToRgb(
        h,
        clamp(+match[2]! / 100),
        clamp(+match[3]! / 100),
        readAlpha(match[4]),
      ),
      h,
    );
    return { ...next, h };
  }
  match =
    /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(
      text,
    );
  if (match) {
    const L = match[2] ? +match[1]! / 100 : +match[1]!;
    return rgbToHsv(
      oklchToRgb(clamp(L), +match[3]!, +match[4]!, readAlpha(match[5])),
      hue,
    );
  }
  // Let Chromium resolve named and newer CSS color spaces in sRGB. A one-pixel,
  // on-device canvas avoids a second incomplete CSS color grammar.
  if (
    CSS.supports("color", input) &&
    !/var\(|currentcolor/i.test(input) &&
    !/^(inherit|initial|unset|revert|revert-layer)$/i.test(input.trim())
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (context) {
      context.fillStyle = input;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(
        0,
        0,
        1,
        1,
      ).data;
      return rgbToHsv({ r: r / 255, g: g / 255, b: b / 255, a: a / 255 }, hue);
    }
  }
  return null;
}

/** Native top layer avoids clipping inside the scrolling inspector; palettes remain transient. */
export function ColorPicker({
  value,
  label,
  disabled,
  onValueChange,
}: {
  value: string;
  label: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [hsva, setHsva] = useState(
    () => parseColor(value) ?? { h: 0, s: 0, v: 0.5, a: 1 },
  );
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    const parsed = parseColor(value, hsva.h);
    setHsva(parsed ?? { h: 0, s: 0, v: 0.5, a: 1 });
  }
  const represented = parseColor(value) !== null;
  const commit = (next: Hsva) => {
    if (!represented) return;
    // Keep hue precision through 8-bit rounding, especially near gray colors.
    const hex = toHex(next);
    setHsva(next);
    setSynced(hex);
    onValueChange(hex);
  };
  const recoverRangeKey = (
    event: KeyboardEvent<HTMLInputElement>,
    axis: "h" | "a",
  ) => {
    // Earlier page capture handlers can cancel the native range default action.
    // Recover only that canceled action; otherwise retain browser key behavior.
    if (
      !represented ||
      !event.defaultPrevented ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey
    )
      return;
    const max = axis === "h" ? 359 : 100;
    const direction =
      getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1;
    const delta =
      event.key === "ArrowRight"
        ? direction
        : event.key === "ArrowLeft"
          ? -direction
          : event.key === "ArrowUp"
            ? 1
            : event.key === "ArrowDown"
              ? -1
              : 0;
    if (!delta && event.key !== "Home" && event.key !== "End") return;
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? max
          : clamp(Number(event.currentTarget.value) + delta, 0, max);
    commit({ ...hsva, [axis]: axis === "a" ? next / 100 : next });
  };
  const pure = toHex({ ...hsva, s: 1, v: 1, a: 1 });
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (
      event.type === "pointermove" &&
      !event.currentTarget.hasPointerCapture(event.pointerId)
    )
      return;
    if (event.type === "pointerdown") {
      if (event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const box = event.currentTarget.getBoundingClientRect();
    commit({
      ...hsva,
      s: clamp((event.clientX - box.left) / box.width),
      v: 1 - clamp((event.clientY - box.top) / box.height),
    });
  };
  return (
    <>
      <Button
        ref={trigger}
        className="color-swatch"
        aria-label={`Pick ${label.toLowerCase()}`}
        popoverTarget={id}
        disabled={disabled}
        style={{ background: value }}
        onClick={() => {
          const box = trigger.current!.getBoundingClientRect();
          const width = Math.min(264, innerWidth - 32);
          Object.assign(panel.current!.style, {
            width: `${width}px`,
            left: `${Math.max(16, Math.min(box.left, innerWidth - width - 16))}px`,
            top: `${Math.max(16, Math.min(box.bottom + 8, innerHeight - 320))}px`,
          });
        }}
      >
        <span className="sr-only">{label}</span>
      </Button>
      <dialog
        id={id}
        ref={panel}
        popover="auto"
        aria-label={label}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            panel.current?.hidePopover();
            trigger.current?.focus();
          }
        }}
        onBlur={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            // A pressed native invoker will toggle after focus moves. Hiding
            // during that blur would make its default action reopen the panel.
            (event.relatedTarget !== trigger.current ||
              !trigger.current.matches(":active")) &&
            !event.currentTarget.contains(event.relatedTarget)
          )
            panel.current?.hidePopover();
        }}
        className="arc-color-panel"
        style={{ "--picker-hue": pure } as CSSProperties}
      >
        <div className="arc-color-heading">
          <strong>{label}</strong>
          <Button
            variant="ghost"
            aria-label="Close color picker"
            popoverTarget={id}
            popoverTargetAction="hide"
          >
            ×
          </Button>
        </div>
        {!represented && (
          <p className="empty">
            {label === "Border color" ? "Mixed colors" : "Choose a color"}
          </p>
        )}
        <div
          className="arc-color-area"
          onPointerDown={move}
          onPointerMove={move}
        >
          {/* A two-axis picker has no native input equivalent. */}
          <span
            className="arc-color-thumb"
            role="slider"
            tabIndex={represented ? 0 : -1}
            aria-disabled={!represented}
            aria-label="Saturation and brightness"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hsva.s * 100)}
            aria-valuetext={`Saturation ${Math.round(hsva.s * 100)}%, brightness ${Math.round(hsva.v * 100)}%`}
            style={{
              left: `${hsva.s * 100}%`,
              top: `${(1 - hsva.v) * 100}%`,
              background: value,
            }}
            onKeyDown={(event) => {
              const step = event.shiftKey ? 0.1 : 0.01;
              if (
                ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                  event.key,
                )
              ) {
                event.preventDefault();
                commit({
                  ...hsva,
                  s: clamp(
                    hsva.s +
                      (event.key === "ArrowRight"
                        ? step
                        : event.key === "ArrowLeft"
                          ? -step
                          : 0),
                  ),
                  v: clamp(
                    hsva.v +
                      (event.key === "ArrowUp"
                        ? step
                        : event.key === "ArrowDown"
                          ? -step
                          : 0),
                  ),
                });
              }
            }}
          />
        </div>
        <label className="arc-color-range">
          Hue
          <input
            disabled={!represented}
            aria-label="Hue"
            type="range"
            min={0}
            max={359}
            value={hsva.h}
            onKeyDown={(event) => recoverRangeKey(event, "h")}
            onChange={(event) =>
              commit({ ...hsva, h: Number(event.target.value) })
            }
          />
        </label>
        <label className="arc-color-range">
          Alpha
          <input
            disabled={!represented}
            aria-label="Alpha"
            type="range"
            min={0}
            max={100}
            value={hsva.a * 100}
            onKeyDown={(event) => recoverRangeKey(event, "a")}
            onChange={(event) =>
              commit({ ...hsva, a: Number(event.target.value) / 100 })
            }
          />
        </label>
        <div className="arc-color-palette">
          {[
            "#FF704D",
            "#FFA726",
            "#F7DC6F",
            "#29D9AA",
            "#35C6F4",
            "#7D9CFF",
            "#C596FF",
            "#FF86B0",
          ].map((color) => (
            <Button
              key={color}
              aria-label={`Use ${color}`}
              style={{ background: color }}
              onClick={() => onValueChange(color)}
            />
          ))}
        </div>
      </dialog>
    </>
  );
}
