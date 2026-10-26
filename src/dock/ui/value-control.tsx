// Adapted from UIArc Slider and Number Field, MIT © 2026 Elia Kuratli.
// Native range/number controls retain browser keyboard and pointer semantics;
// precise edits omit the upstream momentum and rolling-digit decoration.
import { useState, type CSSProperties } from "react";
import { Select } from "./select";
import { Button } from "./button";

export function ValueControl({
  id,
  label,
  value,
  resolvedValue,
  disabled,
  percent = false,
  sliderMax,
  negative = false,
  allowAuto = false,
  invalid = false,
  instant = false,
  onValueChange,
}: {
  id: string;
  label: string;
  value: string;
  resolvedValue?: string;
  disabled: boolean;
  percent?: boolean;
  sliderMax?: number;
  negative?: boolean;
  allowAuto?: boolean;
  invalid?: boolean;
  instant?: boolean;
  onValueChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<{ source: string; text: string } | null>(
    null,
  );
  const [typingUnit, setTypingUnit] = useState("px");
  const match = value
    .trim()
    .match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))(px|%|rem|em|vh|vw|dvh|dvw|ch)?$/);
  const unit = percent
    ? "%"
    : value === "auto" && allowAuto
      ? "auto"
      : (match?.[2] ?? (draft?.source === value ? typingUnit : "px"));
  const number = match ? Number(match[1]) * (percent ? 100 : 1) : null;
  // Keep one stable range scale throughout this mounted control's edit session.
  const [rangeMax, setRangeMax] = useState(
    Math.max(sliderMax ?? 0, number ?? 0),
  );
  if (number !== null && number > rangeMax) setRangeMax(number);
  const shown = number === null ? "" : Number(number.toFixed(3));
  const min = negative ? undefined : 0;
  const max = percent ? 100 : sliderMax;
  const commit = (raw: string, nextUnit = unit, typing = false) => {
    let next: string;
    if (nextUnit === "auto") next = "auto";
    else if (!raw.trim()) next = "";
    else if (!Number.isFinite(Number(raw))) next = raw;
    else
      next = percent ? String(Number(raw) / 100) : `${Number(raw)}${nextUnit}`;
    // Keep an unfinished decimal/sign under the caret. A Reset or new selection
    // changes source, so it cannot inherit the previous input's typing buffer.
    if (typing) setTypingUnit(nextUnit);
    setDraft(typing ? { source: next, text: raw } : null);
    onValueChange(next);
  };
  const nudge = (direction: number) => {
    if (number === null) return;
    const next = Number(
      (
        (number ?? 0) +
        direction * (unit === "rem" || unit === "em" ? 0.1 : 1)
      ).toFixed(3),
    );
    commit(
      String(
        Math.max(min ?? -Infinity, Math.min(percent ? 100 : Infinity, next)),
      ),
      unit === "auto" ? "px" : unit,
    );
  };
  return (
    <div className="value-control">
      <div className="value-stepper">
        <Button
          variant="ghost"
          type="button"
          aria-label={`Decrease ${label}`}
          disabled={
            disabled || number === null || (min !== undefined && number <= min)
          }
          onClick={() => nudge(-1)}
        >
          −
        </Button>
        <input
          id={id}
          aria-label={label}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          value={draft?.source === value ? draft.text : shown}
          onBlur={() => {
            if (number !== null) setDraft(null);
          }}
          placeholder={
            value === "auto" ? "Auto" : match ? "" : value ? "Mixed" : "—"
          }
          disabled={disabled}
          onKeyDown={(event) => {
            if (
              ["ArrowUp", "ArrowDown", "PageUp", "PageDown"].includes(event.key)
            ) {
              event.preventDefault();
              nudge(
                (event.key === "ArrowDown" || event.key === "PageDown"
                  ? -1
                  : 1) *
                  (event.shiftKey || event.key.startsWith("Page") ? 10 : 1),
              );
            }
          }}
          onChange={(event) =>
            commit(event.target.value, unit === "auto" ? "px" : unit, true)
          }
        />
        {percent || sliderMax !== undefined ? (
          <span className="value-unit">{unit}</span>
        ) : (
          <Select
            id={`${id}-unit`}
            label={`${label} unit`}
            instant={instant}
            value={unit}
            options={[
              ...(allowAuto ? ["auto"] : []),
              "px",
              "%",
              "rem",
              "em",
              "vh",
              "vw",
              "dvh",
              "dvw",
              "ch",
            ]}
            optionLabels={{ auto: "Auto" }}
            disabled={disabled}
            onValueChange={(nextUnit) => {
              if (number === null && draft?.source === value) {
                commit(draft.text, nextUnit, true);
                return;
              }
              const resolved = Number.parseFloat(resolvedValue ?? "");
              const fallback =
                unit === "auto" &&
                nextUnit === "px" &&
                Number.isFinite(resolved)
                  ? resolved
                  : 1;
              commit(String(number ?? fallback), nextUnit);
            }}
          />
        )}
        <Button
          variant="ghost"
          type="button"
          aria-label={`Increase ${label}`}
          disabled={disabled || number === null || (percent && number >= 100)}
          onClick={() => nudge(1)}
        >
          +
        </Button>
      </div>
      {max !== undefined && (
        <input
          className="value-slider"
          type="range"
          aria-label={label}
          aria-valuetext={number === null ? value : `${shown}${unit}`}
          min={0}
          max={percent ? 100 : Math.max(max, rangeMax)}
          step={percent ? 1 : 0.01}
          value={Math.max(0, number ?? 0)}
          disabled={disabled || number === null || (!percent && unit !== "px")}
          style={
            {
              "--fill": `${Math.max(0, Math.min(100, ((number ?? 0) / Math.max(max, rangeMax)) * 100))}%`,
            } as CSSProperties
          }
          onKeyDown={(event) => {
            if (
              ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                event.key,
              )
            ) {
              event.preventDefault();
              nudge(
                (event.key === "ArrowLeft" || event.key === "ArrowDown"
                  ? -1
                  : 1) * (event.shiftKey ? 10 : 1),
              );
            }
          }}
          onChange={(event) => commit(event.target.value)}
        />
      )}
    </div>
  );
}
