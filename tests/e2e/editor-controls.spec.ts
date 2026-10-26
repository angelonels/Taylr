import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure first: common edits require CSS syntax, advanced controls dominate,
// sliders cannot be keyed/dragged, and collapsing Advanced loses a draft.
test("Editor offers direct controls and an opt-in Advanced section", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    const target = page.locator("#keep");
    await target.click();
    await page.screenshot({ path: evidencePath("editor-controls-open.png") });
    await expect(
      dock.getByRole("button", { name: "Layout", exact: true }),
    ).toHaveCount(0);
    await expect(dock.locator("#edit-width")).toBeHidden();
    const opacity = dock.getByRole("slider", { name: "Opacity", exact: true });
    await expect(opacity).toBeVisible();
    await opacity.focus();
    await page.keyboard.press("Home");
    await page.keyboard.press("ArrowRight");
    await expect(target).toHaveCSS("opacity", "0.01");
    await dock
      .getByRole("button", { name: "Reset Opacity", exact: true })
      .click();
    await dock
      .getByRole("button", { name: "Increase Font size", exact: true })
      .click();
    await expect(dock.locator("#edit-font-size")).toHaveValue(/^\d/);
    await dock.locator("#edit-font-size").fill("24");
    await expect(target).toHaveCSS("font-size", "24px");
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    await dock.locator("#edit-width").fill("320");
    await expect(target).toHaveCSS("width", "320px");
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    await expect(dock.locator("#edit-width")).toBeHidden();
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    await expect(dock.locator("#edit-width")).toHaveValue("320");
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    await page.screenshot({ path: evidencePath("editor-direct-controls.png") });
  } finally {
    await context.tracing.stop({
      path: evidencePath("editor-direct-controls-trace.zip"),
    });
    await instance.close();
  }
});

// Failure: controlled numeric inputs erase a decimal point or minus sign while
// typing, so users cannot enter fractional or negative values normally.
test("Editor numbers preserve decimal drafts and units without CSS typing", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    const target = page.locator("#keep");
    await target.click();
    const size = dock.locator("#edit-font-size");
    await size.fill("");
    await size.pressSequentially("12.5");
    await expect(size).toHaveValue("12.5");
    await expect(target).toHaveCSS("font-size", "12.5px");
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    const margin = dock.locator("#edit-margin-left");
    await margin.fill("");
    await margin.pressSequentially("-2.5");
    await expect(margin).toHaveValue("-2.5");
    await expect(target).toHaveCSS("margin-left", "-2.5px");
    const unit = dock.getByRole("combobox", {
      name: "Margin left unit",
      exact: true,
    });
    await unit.click();
    await dock.getByRole("option", { name: "rem", exact: true }).click();
    await expect(unit).toContainText("rem");
    await expect(target).toHaveCSS("margin-left", "-40px");
    await margin.fill("");
    await margin.pressSequentially("-3.5");
    await expect(unit).toContainText("rem");
    await expect(target).toHaveCSS("margin-left", "-56px");
    await margin.fill("");
    await margin.pressSequentially("-");
    await margin.press("Tab");
    await expect(margin).toHaveValue("-");
    await expect(unit).toContainText("rem");
    await margin.focus();
    await margin.pressSequentially("4");
    await expect(target).toHaveCSS("margin-left", "-64px");
    await dock
      .getByRole("combobox", { name: "Width unit", exact: true })
      .click();
    await dock.getByRole("option", { name: "Auto", exact: true }).click();
    await expect(dock.locator("#edit-width")).toHaveAttribute(
      "placeholder",
      "Auto",
    );
    await dock.locator("#edit-width").fill("240");
    await expect(target).toHaveCSS("width", "240px");
  } finally {
    await context.tracing.stop({
      path: evidencePath("editor-number-drafts-trace.zip"),
    });
    await instance.close();
  }
});

test("Advanced retains useful gaps on existing rows and grids", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  await context.tracing.start({ screenshots: true, snapshots: true });
  try {
    const bridge = await driver(context, extensionId);
    const page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const target = page.locator("#keep");
    await target.evaluate((element) => (element.style.display = "grid"));
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await target.click();
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    await dock.locator("#edit-row-gap").fill("12");
    await expect(target).toHaveCSS("row-gap", "12px");
    await dock.locator("#edit-column-gap").fill("8");
    await expect(target).toHaveCSS("column-gap", "8px");
    await expect(dock.locator("#edit-display")).toHaveCount(0);
  } finally {
    await context.tracing.stop({
      path: evidencePath("editor-advanced-spacing-trace.zip"),
    });
    await instance.close();
  }
});

// Page keyboard shortcuts must not receive typing meant for panel controls.
test("Editor controls isolate trusted input from page shortcut handlers", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId),
      page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    await page.evaluate(() => {
      document.documentElement.dataset.pageKeys = "0";
      window.addEventListener("keydown", (event) => {
        if (event.key === "ArrowRight") {
          document.documentElement.dataset.pageKeys = String(
            Number(document.documentElement.dataset.pageKeys) + 1,
          );
          event.preventDefault();
        }
      });
    });
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await page.locator("#keep").click();
    await dock.getByRole("button", { name: "Pick color", exact: true }).click();
    const hue = dock.getByRole("slider", { name: "Hue", exact: true });
    await hue.focus();
    const before = Number(await hue.inputValue());
    await page.keyboard.press("ArrowRight");
    await expect(hue).toHaveValue(String(before + 1));
    await expect(page.locator("html")).toHaveAttribute("data-page-keys", "0");
  } finally {
    await context.tracing.stop({
      path: evidencePath("editor-input-isolation.zip"),
    });
    await instance.close();
  }
});

// Failure: mixed values silently become zero and fractional range values snap;
// a large initial value changes the scale midway through dragging.
test("Editor sliders preserve mixed and fractional baselines with a stable scale", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId } = instance;
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });
  try {
    const bridge = await driver(context, extensionId),
      page = await context.newPage();
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    const target = page.locator("#keep");
    await target.evaluate((element) =>
      Object.assign((element as HTMLElement).style, {
        fontSize: "96px",
        borderWidth: "1px 6px 2px 10px",
        borderStyle: "solid",
      }),
    );
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await target.click();
    const size = dock.getByRole("slider", { name: "Font size", exact: true });
    await size.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(size).toHaveAttribute("max", "96");
    await dock.locator("#edit-font-size").fill("15.5");
    await expect(size).toHaveValue("15.5");
    await page.keyboard.press("Tab");
    await size.focus();
    await page.keyboard.press("ArrowRight");
    await expect(target).toHaveCSS("font-size", "16.5px");
    await expect(
      dock.getByRole("slider", { name: "Border width", exact: true }),
    ).toBeDisabled();
    await expect(
      dock.getByRole("button", { name: "Increase Border width", exact: true }),
    ).toBeDisabled();
    await dock.locator("#edit-border-width").focus();
    await page.keyboard.press("ArrowUp");
    await expect(target).toHaveCSS("border-width", "1px 6px 2px 10px");
    await dock.locator("#edit-border-width").fill("3");
    await expect(target).toHaveCSS("border-width", "3px");
  } finally {
    await context.tracing.stop({
      path: evidencePath("editor-slider-baselines-trace.zip"),
    });
    await instance.close();
  }
});
