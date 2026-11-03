import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure first: focus leaves the popover before the trigger click, hiding it
// early; the same native click then toggles it open again. A held press lets
// the asynchronous light-dismiss toggle land before the click, as a person's
// ~quarter-second press or a loaded CPU does.
for (const control of ["color", "select"] as const)
  for (const press of ["click", "held press"] as const)
    test(`An open ${control} closes when its trigger ${press === "click" ? "is clicked" : "gets a held press"} again`, async () => {
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
        const trigger =
          control === "color"
            ? dock.getByRole("button", { name: "Pick color", exact: true })
            : dock.locator("#edit-font-family");
        const popup =
          control === "color"
            ? dock.getByRole("dialog", { name: "Color", exact: true })
            : dock.locator("#edit-font-family-menu");
        await trigger.click();
        await expect(popup).toBeVisible();
        if (control === "color")
          await popup.getByRole("slider", { name: "Hue", exact: true }).focus();
        else
          await expect(popup.locator('[role="option"]').first()).toBeFocused();
        if (press === "click") await trigger.click();
        else {
          await trigger.hover();
          await page.mouse.down();
          await page.waitForTimeout(250);
          await page.mouse.up();
        }
        await expect(popup).toBeHidden();
        await expect(trigger).toBeFocused();
        // A fresh activation can open it again; closing must not disable the control.
        await trigger.click();
        await expect(popup).toBeVisible();
        if (control === "color") {
          await popup
            .getByRole("button", { name: "Close color picker" })
            .focus();
          await page.keyboard.press("Shift+Tab");
          await expect(trigger).toBeFocused();
          await expect(popup).toBeHidden();
          await trigger.press("Space");
          await expect(popup).toBeVisible();
          await popup
            .getByRole("button", { name: "Close color picker" })
            .click();
          await expect(popup).toBeHidden();
          await trigger.click();
          await expect(popup).toBeVisible();
        }
        await page.keyboard.press("Escape");
        await expect(popup).toBeHidden();
        await expect(dock.locator("#edit-save")).toBeVisible();
      } finally {
        try {
          await context.tracing.stop({
            path: evidencePath(
              `popover-toggle-${control}-${press.replace(" ", "-")}.zip`,
            ),
          });
        } finally {
          await instance.close();
        }
      }
    });
