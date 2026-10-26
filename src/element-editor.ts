import {
  fields,
  validStyles,
  textEditable,
  type StylePatch,
} from "./edit-properties";
import type { Rule } from "./model";
export interface EditState {
  tag: string;
  values: StylePatch;
  resolved: StylePatch;
  changed: string[];
  invalid: string[];
  text: string | null;
}
export class ElementEditor {
  target: Element | null = null;
  selector = "";
  baseline: StylePatch = {};
  resolved: StylePatch = {};
  values: StylePatch = {};
  changes: StylePatch = {};
  invalid = new Set<string>();
  originalText: string | null = null;
  text: string | null = null;
  begin(target: Element, selector: string, specified: StylePatch = {}) {
    this.clear();
    this.target = target;
    this.selector = selector;
    const computed = getComputedStyle(target);
    this.resolved = Object.fromEntries(
      fields.map((field) => {
        let value = computed.getPropertyValue(field.key);
        // Compact opaque sRGB values also give the native color picker an exact seed.
        const rgb = value.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
        if ("kind" in field && field.kind === "color" && rgb)
          value = `#${rgb
            .slice(1)
            .map((channel) => Number(channel).toString(16).padStart(2, "0"))
            .join("")}`;
        return [field.key, value];
      }),
    );
    this.baseline = { ...this.resolved, ...specified };
    this.values = { ...this.baseline };
    this.originalText = textEditable(target) ? target.textContent : null;
    this.text = this.originalText;
  }
  clear() {
    this.target = null;
    this.selector = "";
    this.changes = {};
    this.invalid.clear();
    this.text = this.originalText = null;
  }
  set(key: string, raw: string) {
    const field = fields.find((field) => field.key === key);
    if (!field || !this.target) return;
    this.values = { ...this.values, [key]: raw };
    const value =
      "kind" in field &&
      field.kind === "length" &&
      /^-?\d+(?:\.\d+)?$/.test(raw)
        ? `${raw}px`
        : raw.trim();
    this.invalid.delete(key);
    // Browser-computed baselines can be valid CSS outside our preset choices.
    // Re-selecting one resets the override; it does not introduce new CSS.
    if (value === this.baseline[key]) delete this.changes[key];
    else if (!validStyles({ [key]: value }) || !CSS.supports(key, value)) {
      this.invalid.add(key);
      delete this.changes[key];
    } else this.changes[key] = value;
  }
  reset(key: string) {
    this.values = { ...this.values, [key]: this.baseline[key] };
    this.invalid.delete(key);
    delete this.changes[key];
  }
  get changedText() {
    return this.text !== null && this.text !== this.originalText
      ? this.text
      : undefined;
  }
  get dirty() {
    return (
      Object.keys(this.changes).length > 0 || this.changedText !== undefined
    );
  }
  get state(): EditState | null {
    if (!this.target) return null;
    return {
      tag: this.target.localName,
      values: this.values,
      resolved: this.resolved,
      changed: Object.keys(this.changes),
      invalid: [...this.invalid],
      text: this.text,
    };
  }
}
// Keep framework-owned text fragments and comments in place. Restoration only
// touches the exact nodes and values this editor still owns.
interface TextPart {
  node: Text;
  original: string;
  applied: string;
}
interface TextSnapshot {
  applied: string;
  parts: TextPart[];
  created?: Text;
  since: number;
  writes: number;
  blocked: boolean;
}
const textNodes = (element: Element) =>
  [...element.childNodes].filter(
    (node): node is Text => node.nodeType === Node.TEXT_NODE,
  );
function ownsText(element: Element, snapshot: TextSnapshot) {
  const nodes = textNodes(element);
  return (
    nodes.length === snapshot.parts.length &&
    snapshot.parts.every(
      (part, index) =>
        nodes[index] === part.node && part.node.data === part.applied,
    )
  );
}
export class TextEdits {
  private tracked = new Map<Element, TextSnapshot>();
  apply(rules: Rule[], draft?: { target: Element; text: string }) {
    let newlyBlocked = false;
    const desired = new Map<Element, string>();
    for (const rule of rules) {
      if (rule.kind !== "edit" || typeof rule.text !== "string") continue;
      try {
        for (const element of document.querySelectorAll(rule.selector))
          if (textEditable(element)) desired.set(element, rule.text);
      } catch {
        /* An obsolete selector cannot block other rules. */
      }
    }
    if (draft && textEditable(draft.target))
      desired.set(draft.target, draft.text);
    for (const [element, previous] of this.tracked) {
      if (!desired.has(element)) {
        if (ownsText(element, previous)) {
          for (const part of previous.parts) part.node.data = part.original;
          previous.created?.remove();
        }
        this.tracked.delete(element);
      }
    }
    for (const [element, text] of desired) {
      const previous = this.tracked.get(element);
      if (previous?.blocked && previous.applied === text) continue;
      const retained = previous && ownsText(element, previous);
      const now = performance.now();
      const repeated = previous?.applied === text && now - previous.since < 250;
      const entry: TextSnapshot = {
        applied: text,
        parts: retained
          ? previous.parts
          : textNodes(element).map((node) => ({
              node,
              original: node.data,
              applied: node.data,
            })),
        created: retained ? previous.created : undefined,
        since: repeated ? previous.since : now,
        writes: repeated ? previous.writes : 0,
        blocked: false,
      };
      if (element.textContent !== text) {
        // Yield to reactive sites instead of starving the event loop.
        entry.blocked = ++entry.writes > 5;
        newlyBlocked ||= entry.blocked;
        if (!entry.blocked) {
          if (!entry.parts.length) {
            const node = document.createTextNode("");
            element.append(node);
            entry.parts.push({ node, original: "", applied: "" });
            entry.created = node;
          }
          entry.parts.forEach((part, index) => {
            part.applied = index === 0 ? text : "";
            part.node.data = part.applied;
          });
        }
      }
      this.tracked.set(element, entry);
    }
    return newlyBlocked;
  }
}
