import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

for (const mode of ["desktop", "short", "coarse"] as const) {
  test(`Color area keeps its popover during a native pointer drag (${mode})`, async () => {
    const instance = await isolatedBrowser(undefined, {
      hasTouch: mode === "coarse",
    });
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
      if (mode === "short")
        await page.setViewportSize({ width: 320, height: 480 });
      const trigger = dock.getByRole("button", {
        name: "Pick color",
        exact: true,
      });
      await trigger.click();
      const panel = dock.locator(".arc-color-panel:popover-open");
      const hue = panel.getByRole("slider", { name: "Hue", exact: true });
      await hue.click();
      await expect(hue).toBeFocused();
      const area = panel.locator(".arc-color-area");
      const box = await area.boundingBox();
      expect(box).not.toBeNull();
      const initial = await trigger.getAttribute("style");
      // Start away from the focusable thumb. These are real browser pointer
      // events; moving focus from Hue is the alleged premature-close trigger.
      await page.mouse.move(
        box!.x + box!.width * 0.28,
        box!.y + box!.height * 0.26,
      );
      await page.mouse.down();
      await expect(panel).toBeVisible();
      await expect(trigger).not.toHaveAttribute("style", initial!);
      const samples: string[] = [];
      for (const [x, y] of [
        [0.42, 0.38],
        [0.62, 0.55],
        [0.81, 0.71],
      ]) {
        await page.mouse.move(
          box!.x + box!.width * x,
          box!.y + box!.height * y,
          { steps: 4 },
        );
        await expect(panel).toBeVisible();
        samples.push((await trigger.getAttribute("style"))!);
      }
      await page.mouse.up();
      expect(new Set(samples).size).toBe(3);
      await expect(panel).toBeVisible();
      await test.info().attach("pointer-color-samples", {
        body: JSON.stringify({
          mode,
          samples,
          coarse: await page.evaluate(
            () => matchMedia("(pointer: coarse)").matches,
          ),
        }),
        contentType: "application/json",
      });
      await page.screenshot({
        path: evidencePath(`color-pointer-${mode}.png`),
      });
    } finally {
      await context.tracing.stop({
        path: evidencePath(`color-pointer-${mode}.zip`),
      });
      await instance.close();
    }
  });
}

test("Color native invoker, Shift Tab and Escape keep their dismissal behavior", async () => {
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
    const trigger = dock.getByRole("button", {
      name: "Pick color",
      exact: true,
    });
    const panel = dock.locator(".arc-color-panel:popover-open");
    await trigger.click();
    await panel.getByRole("slider", { name: "Hue", exact: true }).click();
    await trigger.click();
    await expect(panel).toHaveCount(0);
    await trigger.click();
    await panel.getByRole("slider", { name: "Hue", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.press("Enter");
    await panel.getByRole("button", { name: "Close color picker" }).focus();
    // First tabbable popover control goes back to its invoker natively.
    await page.keyboard.press("Shift+Tab");
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
  } finally {
    await context.tracing.stop({
      path: evidencePath("color-native-dismissal.zip"),
    });
    await instance.close();
  }
});
