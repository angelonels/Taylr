import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: collapsing a group conceals an invalid field while Save remains
// disabled, leaving no visible explanation or direct path back to the field.
test("A collapsed invalid field offers visible, focused recovery", async () => {
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
    await page.locator("#keep").click();
    await dock.locator("#edit-opacity").fill("67");
    await dock.locator("#edit-font-size").fill("-");
    await expect(dock.locator("#edit-font-size")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    await dock.locator("#edit-width").fill("-");
    await dock.getByRole("button", { name: "Advanced", exact: true }).click();
    await dock.getByRole("button", { name: "Typography", exact: true }).click();
    await page.setViewportSize({ width: 360, height: 640 });
    await expect(dock.locator("#edit-font-size")).toBeHidden();
    await expect(dock.locator("#edit-save")).toBeDisabled();
    const fix = dock.getByRole("button", {
      name: "Fix font size",
      exact: true,
    });
    await expect(fix).toBeVisible();
    await fix.click();
    await expect(dock.locator("#edit-font-size")).toBeFocused();
    await expect(dock.locator("#edit-font-size")).toBeVisible();
    await expect(
      dock.getByText("Enter a valid font size.", { exact: true }),
    ).toBeInViewport();
    await dock.getByRole("button", { name: "Typography", exact: true }).click();
    await fix.click();
    await expect(dock.locator("#edit-font-size")).toBeFocused();
    await dock.locator("#edit-font-size").fill("24");
    await expect(fix).toHaveCount(0);
    await dock.getByRole("button", { name: "Fix width", exact: true }).click();
    await expect(dock.locator("#edit-width")).toBeFocused();
    await dock.locator("#edit-width").fill("200");
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    await expect(page.locator("#keep")).toHaveCSS("font-size", "24px");
    await expect(page.locator("#keep")).toHaveCSS("opacity", "0.67");
    await expect(page.locator("#keep")).toHaveCSS("width", "200px");
  } finally {
    await context.tracing.stop({
      path: evidencePath("collapsed-invalid-recovery.zip"),
    });
    await instance.close();
  }
});
