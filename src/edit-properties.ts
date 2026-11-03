// One allowlist serves the editor, persisted rules and stylesheet serialization.
export const fields = [
  { key: "color", label: "Color", group: "Appearance", kind: "color" },
  {
    key: "background-color",
    label: "Background",
    group: "Appearance",
    kind: "color",
  },
  { key: "opacity", label: "Opacity", group: "Appearance", kind: "number" },
  { key: "font-family", label: "Font", group: "Typography", kind: "font" },
  { key: "font-size", label: "Font size", group: "Typography", kind: "length" },
  {
    key: "font-weight",
    label: "Font weight",
    group: "Typography",
    options: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
  },
  {
    key: "border-radius",
    label: "Border radius",
    group: "Border",
    kind: "length",
  },
  {
    key: "border-color",
    label: "Border color",
    group: "Border",
    kind: "color",
  },
  {
    key: "border-width",
    label: "Border width",
    group: "Border",
    kind: "length",
  },
  {
    key: "border-style",
    label: "Border style",
    group: "Border",
    options: ["none", "solid", "dashed", "dotted", "double"],
  },
  { key: "width", label: "Width", group: "Size", kind: "length" },
  { key: "height", label: "Height", group: "Size", kind: "length" },
  { key: "aspect-ratio", label: "Aspect ratio", group: "Size", kind: "ratio" },
  ...["padding", "margin"].flatMap((type) =>
    ["top", "right", "bottom", "left"].map((side) => ({
      key: `${type}-${side}`,
      label: `${type[0].toUpperCase()}${type.slice(1)} ${side}`,
      group: type === "padding" ? "Padding" : "Margin",
      kind: "length",
    })),
  ),
  {
    key: "display",
    label: "Display",
    group: "Layout",
    options: [
      "block",
      "inline",
      "inline-block",
      "flex",
      "inline-flex",
      "grid",
      "inline-grid",
    ],
  },
  {
    key: "flex-direction",
    label: "Direction",
    group: "Layout",
    options: ["row", "column", "row-reverse", "column-reverse"],
  },
  {
    key: "justify-content",
    label: "Justify content",
    group: "Layout",
    options: [
      "normal",
      "flex-start",
      "center",
      "flex-end",
      "space-between",
      "space-around",
      "space-evenly",
    ],
  },
  {
    key: "align-items",
    label: "Align items",
    group: "Layout",
    options: [
      "normal",
      "stretch",
      "flex-start",
      "center",
      "flex-end",
      "baseline",
    ],
  },
  { key: "row-gap", label: "Row gap", group: "Spacing", kind: "length" },
  { key: "column-gap", label: "Column gap", group: "Spacing", kind: "length" },
] as const;
export type StylePatch = Record<string, string>;
export function validStyles(input: unknown): input is StylePatch {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false;
  return Object.entries(input).every(([key, value]) => {
    const field = fields.find((field) => field.key === key);
    if (!field || typeof value !== "string" || value.length > 256) return false;
    if ("options" in field)
      return (field.options as readonly string[]).includes(value);
    if (field.kind === "ratio")
      return (
        value === "auto" ||
        /^(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*)(?:\s*\/\s*(?:[1-9]\d*(?:\.\d+)?|0\.\d*[1-9]\d*))?$/.test(
          value,
        )
      );
    // Quotes must pair so a family name cannot open an unterminated string.
    if (field.kind === "font")
      return /^(?:[\w\s,-]|"[\w\s,-]*"|'[\w\s,-]*')+$/.test(value);
    if (field.kind === "color")
      return /^(?:#[\da-f]{3,8}|[a-z]+|(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\([\w\s.,%+/-]+\))$/i.test(
        value,
      );
    if (field.kind === "number")
      return /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(value);
    return (
      /^(?:auto|normal|fit-content|max-content|min-content|-?(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|rem|em|vh|vw|dvh|dvw|ch)?)$/.test(
        value,
      ) &&
      (!value.startsWith("-") || key.startsWith("margin-"))
    );
  });
}
export function declarations(styles: StylePatch) {
  return validStyles(styles)
    ? Object.entries(styles)
        .map(([key, value]) => `${key}:${value} !important;`)
        .join("")
    : "";
}
export function textEditable(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.children.length === 0 &&
    !element.matches(
      "input,textarea,select,option,script,style,noscript,img,video,audio,canvas,iframe,object,embed,br,hr,area,base,link,meta,source,track,wbr",
    ) &&
    !element.closest('[contenteditable]:not([contenteditable="false"])')
  );
}
