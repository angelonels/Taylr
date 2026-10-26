import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: Save rebuilds controls from computed pixels, dropping declared units;
// switching Auto back to a length invents zero and makes the element disappear.
test("Saved lengths retain units and Auto returns to a real size", async () => {
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
    const dock = await openDock(context, bridge, page);
    await startEdit(dock);
    await page.locator("#keep").click();
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    await dock.locator("#edit-width").fill("2");
    const unit = dock.locator("#edit-width-unit");
    await unit.click();
    await unit.click();
    await expect(
      dock.getByRole("listbox", { name: "Width unit", exact: true }),
    ).toBeHidden();
    await unit.click();
    await dock.getByRole("option", { name: "rem", exact: true }).click();
    await expect(page.locator("#keep")).toHaveCSS("width", "32px");
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    await expect(dock.locator("#edit-width")).toHaveValue("2");
    await expect(unit).toHaveText(/rem/);
    await page.keyboard.press("Escape");
    await startEdit(dock);
    await page.locator("#keep").click();
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    await expect(dock.locator("#edit-width")).toHaveValue("2");
    await expect(unit).toHaveText(/rem/);
    await unit.click();
    await dock.getByRole("option", { name: "Auto", exact: true }).click();
    await unit.click();
    await dock.getByRole("option", { name: "px", exact: true }).click();
    await expect(dock.locator("#edit-width")).toHaveValue("32");
    await expect(page.locator("#keep")).toHaveCSS("width", "32px");
    await unit.click();
    await dock.getByRole("option", { name: "Auto", exact: true }).click();
    await unit.click();
    await dock.getByRole("option", { name: "rem", exact: true }).click();
    await expect(dock.locator("#edit-width")).toHaveValue("1");
    await expect(page.locator("#keep")).toHaveCSS("width", "16px");
  } finally {
    await context.tracing.stop({ path: evidencePath("edit-units-trace.zip") });
    await instance.close();
  }
});
