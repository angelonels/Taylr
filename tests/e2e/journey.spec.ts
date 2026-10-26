import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure contracts: opening implies an active tool; initial focus suggests Hide
// while the main task is Edit; selecting changes the page before an edit; Save
// and Cancel are unclear; paused sites leave no direct route back to work.
test("Panel journey: choose, pick, edit, save, review and resume", async () => {
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
    const target = page.locator("#keep");
    const original = await target.textContent();
    await expect(dock.locator("#start-edit")).toBeFocused();
    await expect(dock.locator("#edit")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(dock.locator("#hide")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await page.screenshot({ path: evidencePath("journey-01-open.png") });
    await dock.locator("#start-edit").press("Enter");
    await expect(
      dock.getByRole("heading", { name: "Pick an element" }),
    ).toBeVisible();
    await expect(dock.locator("#edit")).toHaveAttribute("aria-pressed", "true");
    await expect(target).toHaveText(original!);
    await page.screenshot({ path: evidencePath("journey-02-pick.png") });
    await target.click();
    await expect(dock.locator("#edit-save")).toBeDisabled();
    await dock.locator("#edit-text").fill("A clear next step");
    await expect(dock.locator("#edit-save")).toBeEnabled();
    await page.screenshot({ path: evidencePath("journey-03-edit.png") });
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#edit-save")).toHaveAttribute(
      "data-state",
      "success",
    );
    await expect(dock.locator("#edit-discard")).toContainText("Done");
    await dock.locator("#edit-save").hover();
    await expect(dock.locator("#edit-save")).toHaveCSS(
      "color",
      "rgb(196, 247, 228)",
    );
    await page.screenshot({ path: evidencePath("journey-04-saved.png") });
    await dock.locator("#edit-discard").click();
    await expect(dock.locator("#start-edit")).toBeFocused();
    await dock.locator("#view-edits").click();
    await expect(
      dock.getByRole("region", { name: "Saved edits" }),
    ).toBeVisible();
    await expect(target).toHaveText("A clear next step");
    await page.screenshot({ path: evidencePath("journey-05-edits.png") });
    await dock.locator("#site-toggle").click();
    await dock.locator("#site-pause").click();
    await dock.locator("#site-toggle").click();
    await expect(dock.locator("#resume-site")).toBeVisible();
    await expect(dock.locator("#start-edit")).not.toBeVisible();
    await dock.locator("#resume-site").click();
    await expect(dock.locator("#start-edit")).toBeVisible();
    await dock.locator("#start-hide").click();
    await expect(dock.locator("#hide")).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(dock.locator("#start-hide")).toBeFocused();
  } finally {
    await context.tracing.stop({ path: evidencePath("journey-trace.zip") });
    await instance.close();
  }
});
