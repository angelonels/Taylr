import { Fragment, useState } from "react";
import { Select } from "./ui/select";
import { ColorPicker } from "./ui/color-picker";
import { AccordionSection } from "./ui/accordion";
import { Button } from "./ui/button";
import { ActionButton } from "./ui/action-button";
import { Input, Textarea } from "./ui/field";
import { fields } from "../edit-properties";
import { ValueControl } from "./ui/value-control";
import { Icon } from "./icon";
import type { Inspector, InspectorState } from "../inspector";

const groups = ["Appearance", "Typography", "Border", "Advanced"];
export function EditPanel({
  inspector,
  state,
  instant,
}: {
  inspector: Inspector;
  state: InspectorState;
  instant: boolean;
}) {
  const [recovery, setRecovery] = useState({ id: "", request: 0 });
  const edit = state.editor;
  const hierarchy = (
    <>
      <Button
        type="button"
        id="parent"
        disabled={state.busy || !state.selection?.parent}
        onClick={() => inspector.parent()}
      >
        <Icon name="up" /> Parent
      </Button>
      <Button
        type="button"
        id="child"
        disabled={state.busy || !state.selection?.child}
        onClick={() => inspector.child()}
      >
        <Icon name="down" /> Child
      </Button>
    </>
  );
  if (!edit && recovery.request) setRecovery({ id: "", request: 0 });
  if (!edit)
    return (
      <section className="edit-empty" aria-label="Edit elements">
        <span className="empty-crosshair" aria-hidden="true">
          <Icon name="edit" />
        </span>
        <h2>Pick an element</h2>
        <p>Point at an element, then click to edit it.</p>
        <div className="edit-selection text-start">
          <div>
            <span className="section-label">Selection</span>
            <strong>{state.selection?.label ?? "No element selected"}</strong>
          </div>
        </div>
        <p className="empty">Refine your selection in the editor.</p>
        <Button type="button" id="edit-cancel" onClick={() => inspector.stop()}>
          Cancel <kbd>esc</kbd>
        </Button>
      </section>
    );
  const gapControls = /flex|grid/.test(edit.values.display ?? "");
  const advancedGroups = gapControls
    ? ["Size", "Padding", "Margin", "Spacing"]
    : ["Size", "Padding", "Margin"];
  const invalidField = fields.find((field) => edit.invalid.includes(field.key));
  return (
    <section className="edit-panel" aria-label="Element editor">
      <div className="edit-selection">
        <div>
          <span className="section-label">Selection</span>
          <strong>{state.selection?.label}</strong>
        </div>
        <Button
          type="button"
          id="edit-pick"
          disabled={state.busy}
          onClick={() => inspector.pickAgain()}
        >
          <Icon name="hide" /> Pick
        </Button>
      </div>
      <div className="edit-hierarchy">
        {hierarchy}
        <Button
          type="button"
          id="edit-hide"
          disabled={state.busy}
          onClick={() => void inspector.hide()}
        >
          <Icon name="hide" /> Hide
        </Button>
      </div>
      <div className="edit-fields">
        {edit.text !== null && (
          <Textarea
            label="Text"
            id="edit-text"
            value={edit.text}
            maxLength={5000}
            disabled={state.busy}
            onChange={(event) => inspector.editText(event.target.value)}
          />
        )}
        {groups.map((group) => (
          <AccordionSection
            key={group}
            name={group}
            instant={instant}
            defaultOpen={group !== "Advanced"}
            openRequest={
              fields.some(
                (field) =>
                  `edit-${field.key}` === recovery.id &&
                  (group === "Advanced"
                    ? advancedGroups.includes(field.group)
                    : field.group === group),
              )
                ? recovery.request
                : 0
            }
            focusId={recovery.id}
            title={
              <>
                <span className="group-title">{group}</span>
                <span className="group-count">
                  {fields.filter(
                    (field) =>
                      (group === "Advanced"
                        ? advancedGroups.includes(field.group)
                        : field.group === group) &&
                      edit.changed.includes(field.key),
                  ).length || ""}
                </span>
                <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
                  <path
                    d="m4 6 4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </>
            }
          >
            <div
              className={
                group === "Advanced"
                  ? "property-grid advanced-fields"
                  : "property-list"
              }
            >
              {fields
                .filter((field) =>
                  group === "Advanced"
                    ? advancedGroups.includes(field.group)
                    : field.group === group,
                )
                .map((field) => {
                  const value = edit.values[field.key] ?? "";
                  const invalid = edit.invalid.includes(field.key);
                  const changed = edit.changed.includes(field.key) || invalid;
                  const options: readonly string[] | null =
                    "options" in field
                      ? field.options
                      : "kind" in field && field.kind === "font"
                        ? ["system-ui", "sans-serif", "serif", "monospace"]
                        : "kind" in field && field.kind === "ratio"
                          ? ["auto", "1 / 1", "4 / 3", "3 / 2", "16 / 9"]
                          : null;
                  return (
                    <Fragment key={field.key}>
                      {group === "Advanced" &&
                        [
                          "width",
                          "padding-top",
                          "margin-top",
                          "row-gap",
                        ].includes(field.key) && (
                          <h3 className="advanced-heading">{field.group}</h3>
                        )}
                      <div
                        className={`property ${"kind" in field && field.kind === "color" ? "property-color" : ""}`}
                        data-changed={changed}
                      >
                        <div className="property-label">
                          <label htmlFor={`edit-${field.key}`}>
                            {field.label}
                          </label>
                          {changed && (
                            <Button
                              type="button"
                              className="property-reset"
                              aria-label={`Reset ${field.label}`}
                              title={`Reset ${field.label}`}
                              disabled={state.busy}
                              onClick={() => inspector.resetStyle(field.key)}
                            >
                              <Icon name="undo" />
                            </Button>
                          )}
                        </div>
                        <div className="property-control">
                          {"kind" in field && field.kind === "color" && (
                            <ColorPicker
                              value={value}
                              label={field.label}
                              disabled={state.busy}
                              onValueChange={(color) =>
                                inspector.editStyle(field.key, color)
                              }
                            />
                          )}
                          {options ? (
                            <Select
                              id={`edit-${field.key}`}
                              label={field.label}
                              instant={instant}
                              value={value}
                              options={options}
                              optionLabels={
                                field.key === "font-family"
                                  ? {
                                      "system-ui": "System default",
                                      "sans-serif": "Sans serif",
                                      serif: "Serif",
                                      monospace: "Monospace",
                                    }
                                  : field.key === "aspect-ratio"
                                    ? {
                                        auto: "Auto",
                                        "1 / 1": "Square · 1:1",
                                        "4 / 3": "4:3",
                                        "3 / 2": "3:2",
                                        "16 / 9": "Wide · 16:9",
                                      }
                                    : field.key === "font-weight"
                                      ? {
                                          "100": "Thin",
                                          "200": "Extra light",
                                          "300": "Light",
                                          "400": "Regular",
                                          "500": "Medium",
                                          "600": "Semibold",
                                          "700": "Bold",
                                          "800": "Extra bold",
                                          "900": "Black",
                                        }
                                      : undefined
                              }
                              disabled={state.busy}
                              onValueChange={(value) =>
                                inspector.editStyle(field.key, value)
                              }
                            />
                          ) : "kind" in field &&
                            ["length", "number"].includes(field.kind) ? (
                            <ValueControl
                              resolvedValue={edit.resolved[field.key]}
                              id={`edit-${field.key}`}
                              label={field.label}
                              value={value}
                              disabled={state.busy}
                              percent={field.key === "opacity"}
                              negative={field.key.startsWith("margin-")}
                              allowAuto={
                                ["width", "height"].includes(field.key) ||
                                field.key.startsWith("margin-")
                              }
                              invalid={invalid}
                              instant={instant}
                              sliderMax={
                                field.key === "font-size"
                                  ? 72
                                  : field.key === "border-radius"
                                    ? 64
                                    : field.key === "border-width"
                                      ? 16
                                      : undefined
                              }
                              onValueChange={(value) =>
                                inspector.editStyle(field.key, value)
                              }
                            />
                          ) : (
                            <Input
                              id={`edit-${field.key}`}
                              value={value}
                              aria-invalid={invalid}
                              aria-describedby={
                                invalid ? `edit-${field.key}-error` : undefined
                              }
                              spellCheck={false}
                              autoComplete="off"
                              disabled={state.busy}
                              onChange={(event) =>
                                inspector.editStyle(
                                  field.key,
                                  event.target.value,
                                )
                              }
                            />
                          )}
                        </div>
                        {invalid && (
                          <span
                            className="field-error"
                            id={`edit-${field.key}-error`}
                          >
                            Enter a valid {field.label.toLowerCase()}.
                          </span>
                        )}
                      </div>
                    </Fragment>
                  );
                })}
            </div>
          </AccordionSection>
        ))}
      </div>
      <div className="edit-commit flex-wrap">
        {invalidField && (
          <Button
            className="basis-full"
            disabled={state.busy}
            aria-describedby="edit-recovery-error"
            onClick={() =>
              setRecovery((previous) => ({
                id: `edit-${invalidField.key}`,
                request: previous.request + 1,
              }))
            }
          >
            Fix {invalidField.label.toLowerCase()}
          </Button>
        )}
        {invalidField && (
          <output id="edit-recovery-error" className="sr-only">
            Enter a valid {invalidField.label.toLowerCase()} to save.
          </output>
        )}
        <Button
          type="button"
          id="edit-discard"
          onClick={() => inspector.stop()}
        >
          {state.editorDirty ? "Cancel" : "Done"} <kbd>esc</kbd>
        </Button>
        <ActionButton
          className="save-edit"
          id="edit-save"
          disabled={state.busy || !state.editorDirty || edit.invalid.length > 0}
          instant={instant}
          dirty={state.editorDirty}
          onAction={() => inspector.saveEdit()}
          label="Save"
        />
      </div>
    </section>
  );
}
