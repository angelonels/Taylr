import { expect as baseExpect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { startEdit } from "../dock-actions.mjs";
const expect = baseExpect.configure({ timeout: 15000 });

// Explicit independent expectations, not values copied from the implementation.
const properties = {
  color: "rgb(33, 118, 255)",
  "background-color": "rgb(25, 50, 79)",
  opacity: "0.67",
  "font-family": "monospace",
  "font-size": "19px",
  "font-weight": "600",
  "border-radius": "17px",
  "border-color": "rgb(116, 167, 255)",
  "border-width": "3px",
  "border-style": "solid",
  width: "173px",
  height: "127px",
  "aspect-ratio": "3 / 2",
  "padding-top": "7px",
  "padding-right": "9px",
  "padding-bottom": "11px",
  "padding-left": "13px",
  "margin-top": "3px",
  "margin-right": "5px",
  "margin-bottom": "7px",
  "margin-left": "9px",
};
export const coreProperties = Object.keys(properties);

export async function readEditorStyles(target, keys, withInline = false) {
  const deadline = Date.now() + 15000;
  let snapshot = null;
  await expect
    .poll(async () => {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error("Connected style snapshot timed out");
      snapshot = await target.evaluate(
        (element, { properties, withInline }) => {
          if (!element.isConnected) return null;
          const style = getComputedStyle(element);
          const computed = element.computedStyleMap();
          const styles = Object.fromEntries(
            properties.map((key) => [
              key,
              key === "width" || key === "height"
                ? String(computed.get(key))
                : style.getPropertyValue(key),
            ]),
          );
          const snapshot = withInline
            ? {
                styles,
                inline: Object.fromEntries(
                  properties.map((key) => [
                    key,
                    {
                      value: element.style.getPropertyValue(key),
                      priority: element.style.getPropertyPriority(key),
                    },
                  ]),
                ),
              }
            : styles;
          return element.isConnected ? snapshot : null;
        },
        { properties: keys, withInline },
        { timeout: remaining },
      );
      return snapshot !== null;
    })
    .toBe(true);
  return snapshot;
}

export async function assertRestoredStyles(target, baseline) {
  await expect
    .poll(() =>
      target.evaluate((element, baseline) => {
        const style = getComputedStyle(element),
          computed = element.computedStyleMap();
        return Object.entries(baseline.styles).flatMap(([key, previous]) => {
          const native = element.style.getPropertyValue(key);
          const changed =
            native !== baseline.inline[key].value ||
            element.style.getPropertyPriority(key) !==
              baseline.inline[key].priority;
          // A page can recalculate its inline geometry when shown. Accept only an
          // independently readable new absolute declaration, never any style drift.
          const expected =
            changed && /^-?(?:\d+\.?\d*|\.\d+)px$/.test(native)
              ? `${Number.parseFloat(native)}px`
              : previous;
          const actual =
            key === "width" || key === "height"
              ? String(computed.get(key))
              : style.getPropertyValue(key);
          return actual === expected
            ? []
            : [{ property: key, expected, actual }];
        });
      }, baseline),
    )
    .toEqual([]);
}

export async function assertEditorStyles(target, expected = properties) {
  await expect
    .poll(() =>
      target.evaluate((element, values) => {
        const style = getComputedStyle(element);
        const computed = element.computedStyleMap();
        return Object.fromEntries(
          Object.entries(values).map(([key, value]) => {
            const resolved = style.getPropertyValue(key);
            // CSSOM resolves width/height through min/max and flex sizing. Typed
            // OM exposes the winning computed declaration before layout instead.
            // Keep checking the actual cascade; a missing override still fails.
            return [
              key,
              resolved !== value && (key === "width" || key === "height")
                ? String(computed.get(key))
                : resolved,
            ];
          }),
        );
      }, expected),
    )
    .toEqual(expected);
}

// One UI contract exercises the complete editor on the actual selected website
// node. It never draws, plays media, submits a form, or changes an account.
export async function verifyEditor({
  page,
  dock,
  target,
  selectTarget,
  readProfile,
  readSelection,
  withStableSelection = (action) => action(),
  directory,
}) {
  const gaps = await target.evaluate((element) =>
    /flex|grid/.test(getComputedStyle(element).display),
  );
  // Choose once from the native CSS box. A viewport-sized component must not
  // collapse behind independent fixed page chrome before later Hide/revisits.
  const dimensionInputs = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const baseline = { width: style.width, height: style.height };
    const chosen = {};
    for (const [key, minimum, edges] of [
      ["width", 173, ["Left", "Right"]],
      ["height", 127, ["Top", "Bottom"]],
    ]) {
      let size = parseFloat(baseline[key]);
      if (!Number.isFinite(size)) {
        size = rect[key];
        if (style.boxSizing !== "border-box")
          for (const edge of edges)
            size -=
              (parseFloat(style[`padding${edge}`]) || 0) +
              (parseFloat(style[`border${edge}Width`]) || 0);
      }
      let pixels = Math.max(minimum, Math.round(size * 0.8));
      if (`${pixels}px` === baseline[key]) pixels++;
      chosen[key] = `${pixels}px`;
    }
    return { baseline, chosen };
  });
  const values = {
    ...properties,
    ...dimensionInputs.chosen,
    ...(gaps ? { "row-gap": "5px", "column-gap": "7px" } : {}),
  };
  const baselineStyles = await target.evaluate((element, keys) => {
    const computed = getComputedStyle(element);
    return Object.fromEntries(
      keys.map((key) => [key, computed.getPropertyValue(key)]),
    );
  }, Object.keys(values));
  const report = {
    dimensionInputs,
    properties: Object.keys(values),
    text: { applicable: false },
    checks: [],
  };
  const baseline = await target.evaluate((element) => ({
    text: element.textContent,
    children: element.children.length,
  }));
  const parent = dock.getByRole("button", { name: "Parent", exact: true });
  const child = dock.getByRole("button", { name: "Child", exact: true });
  const direction = (await parent.isEnabled())
    ? "parent"
    : (await child.isEnabled())
      ? "child"
      : null;
  report.hierarchy = { applicable: direction !== null, direction };
  await withStableSelection(async () => {
    if (direction) {
      await (direction === "parent" ? parent : child).click();
      await expect
        .poll(async () => {
          const selection = await readSelection();
          return target.evaluate(
            (element, { selector, direction }) => {
              const next = selector ? document.querySelector(selector) : null;
              return (
                !!next &&
                next !== element &&
                (direction === "parent"
                  ? next.contains(element)
                  : element.contains(next))
              );
            },
            { selector: selection.selector, direction },
          );
        })
        .toBe(true);
      await (direction === "parent" ? child : parent).click();
    }
    await expect
      .poll(async () => {
        const selection = await readSelection();
        return target.evaluate(
          (element, selector) => document.querySelector(selector) === element,
          selection.selector,
        );
      })
      .toBe(true);
  });
  report.checks.push(
    direction === "parent"
      ? "Parent then Child returns to the same component"
      : direction === "child"
        ? "Child then Parent returns to the same component"
        : "Hierarchy not applicable; no selectable parent or child",
  );
  const text = dock.locator("#edit-text");
  const textEligible = (await text.count()) === 1;
  expect(textEligible).toBe(
    await target.evaluate(
      (element) =>
        element instanceof HTMLElement &&
        element.children.length === 0 &&
        !element.matches(
          "input,textarea,select,option,script,style,noscript,img,video,audio,canvas,iframe,object,embed,br,hr,area,base,link,meta,source,track,wbr",
        ) &&
        !element.closest('[contenteditable]:not([contenteditable="false"])'),
    ),
  );
  if (textEligible) {
    await text.fill(`${(baseline.text ?? "").slice(0, 240)} · draft`);
    await expect(target).toHaveText(
      `${(baseline.text ?? "").slice(0, 240)} · draft`,
    );
    await page.keyboard.press("Escape");
    await expect(target).toHaveText(baseline.text ?? "");
    await startEdit(dock);
    await selectTarget(true);
    report.text = {
      applicable: true,
      original: baseline.text,
      saved: `${(baseline.text ?? "").slice(0, 240)} · Taylr`,
    };
  }
  // Reject injection without damaging the component or its previously saved rule.
  const beforeInvalid = await readProfile();
  await dock.locator("#edit-color").fill("red; } body { display:none");
  await expect(dock.locator("#edit-color")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(dock.locator("#edit-save")).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  const bodyDisplay = await page
    .locator("body")
    .evaluate((element) => getComputedStyle(element).display);
  // ARIA does not suppress native input. Attempt the commit with a trusted
  // physical click to verify the guard, bypassing only Playwright's ARIA wait.
  await dock.locator("#edit-save").click({ force: true });
  expect((await readProfile()).rules).toEqual(beforeInvalid.rules);
  await expect(target).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("display", bodyDisplay);
  await dock.getByRole("button", { name: "Reset Color", exact: true }).click();
  expect((await readProfile()).rules).toEqual(beforeInvalid.rules);
  report.checks.push("Invalid CSS rejected; Reset recovers");
  const previous = (await readProfile()).rules.find(
    (rule) => rule.kind === "edit",
  );
  await withStableSelection(async () => {
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    for (const [key, value] of Object.entries(values)) {
      const control = dock.locator(`#edit-${key}`);
      const button = await control.evaluate(
        (element) => element.tagName === "BUTTON",
      );
      if (key === "font-family") expect(button).toBe(true);
      if (button) {
        if (key === "font-family") {
          await control.focus();
          await page.keyboard.press("Space");
          await expect(
            dock.locator('[role="option"][data-state="checked"]'),
          ).toBeFocused();
          await page.keyboard.press("End");
          await expect(
            dock.locator(
              `[role="option"][data-value=${JSON.stringify(value)}]`,
            ),
          ).toBeFocused();
          await page.keyboard.press("Enter");
        } else {
          await control.click();
          await dock
            .locator(`[role="option"][data-value=${JSON.stringify(value)}]`)
            .click();
        }
      } else
        await control.fill(
          key === "opacity" ? String(Number(value) * 100) : value,
        );
    }
    await assertEditorStyles(target, values);
    const appearance = dock.getByRole("button", {
      name: "Appearance",
      exact: true,
    });
    await appearance.click();
    await expect(dock.locator("#edit-color")).toBeHidden();
    await appearance.click();
    await expect(dock.locator("#edit-color")).toBeVisible();
    // Use the real popover and keyboard, then restore a deterministic color.
    await dock.getByRole("button", { name: "Pick color", exact: true }).click();
    const hue = dock.getByRole("slider", { name: "Hue", exact: true });
    const beforeHue = Number(await hue.inputValue());
    await hue.focus();
    await page.keyboard.press("ArrowRight");
    await expect
      .poll(async () => Number(await hue.inputValue()))
      .toBe(beforeHue + 1);
    await page.keyboard.press("Escape");
    await expect(
      dock.getByRole("region", { name: "Element editor" }),
    ).toBeVisible();
    await dock.locator("#edit-color").fill(values.color);
    if (report.text.applicable) await text.fill(report.text.saved);
  });
  report.checks.push("Font listbox keyboard and disclosure preserve draft");
  await dock.locator("#edit-save").click();
  await expect
    .poll(async () => (await readProfile()).rules[0]?.revision)
    .not.toBe(previous.revision);
  await assertEditorStyles(target, values);
  let profile = await readProfile();
  expect(profile.rules).toHaveLength(1);
  const saved = profile.rules[0];
  expect(saved.id).toBe(previous.id);
  expect(saved.selector).toBe(previous.selector);
  expect(saved.styles).toEqual({
    ...previous.styles,
    ...Object.fromEntries(
      Object.entries(values).filter(
        ([key, value]) => baselineStyles[key] !== value,
      ),
    ),
  });
  report.savedProperties = Object.keys(saved.styles);
  report.dimensions = await target.evaluate((element) => {
    const resolved = getComputedStyle(element),
      computed = element.computedStyleMap();
    return Object.fromEntries(
      ["width", "height"].map((key) => [
        key,
        {
          computed: String(computed.get(key)),
          resolved: resolved.getPropertyValue(key),
        },
      ]),
    );
  });
  // A declaration equal to the baseline needs no redundant persisted override.
  // Preview, Save and later revisit assertions still verify its computed value.
  report.unchangedProperties = Object.keys(values).filter(
    (key) => !(key in saved.styles) && baselineStyles[key] === values[key],
  );
  if (report.text.applicable)
    await expect(target).toHaveText(report.text.saved);
  report.checks.push(
    `${Object.keys(values).length} properties preview and Save on the same rule`,
  );
  await dock.locator("#edit-opacity").fill("73");
  await dock.locator("#edit-save").click();
  await expect
    .poll(async () => (await readProfile()).rules[0]?.revision)
    .not.toBe(saved.revision);
  await expect(target).toHaveCSS("opacity", "0.73");
  profile = await readProfile();
  expect(profile.rules).toHaveLength(1);
  expect(profile.rules[0].id).toBe(saved.id);
  expect(profile.rules[0].styles).toEqual({ ...saved.styles, opacity: "0.73" });
  await dock.locator("#undo").click();
  await expect(dock.locator("#status")).toHaveText("Changes undone.");
  await assertEditorStyles(target, values);
  if (report.text.applicable)
    await expect(target).toHaveText(report.text.saved);
  report.checks.push("Repeat Save merges; Undo restores the preceding edit");
  await selectTarget(true);
  await dock.locator("#edit-hide").click();
  await expect(target).toBeHidden();
  await dock.locator("#undo").click();
  await expect(target).toBeVisible();
  await assertEditorStyles(target, values);
  if (report.text.applicable)
    await expect(target).toHaveText(report.text.saved);
  report.checks.push("In-editor Hide and Undo retain the saved customization");
  await writeFile(
    `${directory}/editor-checks.json`,
    JSON.stringify(report, null, 2),
  );
  return { values, report };
}
