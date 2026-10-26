import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

for (const width of [320, 374]) {
  test(`Fine-pointer editor keeps changed labels and controls readable at ${width}px`, async () => {
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
      await dock.locator("#edit-background-color").fill("#19324f");
      await page.setViewportSize({ width, height: 480 });
      expect(
        await page.evaluate(() => matchMedia("(pointer: fine)").matches),
      ).toBe(true);
      const measurements = [];
      for (const key of ["opacity", "background-color"]) {
        const row = dock
          .locator(".property")
          .filter({ has: page.locator(`#edit-${key}`) });
        await row.scrollIntoViewIfNeeded();
        await expect(row.locator(".property-reset")).toBeVisible();
        const measure = await row.evaluate((element) => {
          const rect = (node: Element) => {
            const box = node.getBoundingClientRect();
            return {
              left: box.left,
              right: box.right,
              top: box.top,
              bottom: box.bottom,
              width: box.width,
            };
          };
          const label = element.querySelector(".property-label")!;
          const text = label.querySelector("label")!;
          const reset = label.querySelector("button")!;
          const control =
            element.querySelector(".value-stepper") ??
            element.querySelector(".property-control")!;
          const field = element.closest(".edit-fields")!;
          return {
            row: rect(element),
            label: rect(label),
            text: rect(text),
            reset: rect(reset),
            control: rect(control),
            overflow: field.scrollWidth - field.clientWidth,
            inputWidth: element
              .querySelector("input:not([type=range])")!
              .getBoundingClientRect().width,
          };
        });
        measurements.push({ key, ...measure });
        await test.info().attach(`layout-${key}`, {
          body: JSON.stringify(measure),
          contentType: "application/json",
        });
        expect(measure.overflow).toBeLessThanOrEqual(1);
        expect(measure.text.left).toBeGreaterThanOrEqual(measure.row.left - 1);
        expect(measure.reset.right).toBeLessThanOrEqual(
          measure.label.right + 1,
        );
        expect(measure.text.right).toBeLessThanOrEqual(measure.reset.left + 1);
        expect(measure.label.right).toBeLessThanOrEqual(measure.row.right + 1);
        expect(measure.control.left).toBeGreaterThanOrEqual(
          measure.row.left - 1,
        );
        expect(measure.control.right).toBeLessThanOrEqual(
          measure.row.right + 1,
        );
        const overlaps =
          measure.label.left < measure.control.right &&
          measure.label.right > measure.control.left &&
          measure.label.top < measure.control.bottom &&
          measure.label.bottom > measure.control.top;
        expect(overlaps, `${key} label/Reset must not overlap its input`).toBe(
          false,
        );
        expect(measure.inputWidth).toBeGreaterThanOrEqual(30);
      }
      await page.screenshot({
        path: evidencePath(`editor-narrow-${width}.png`),
      });
      await test.info().attach("editor-layout", {
        body: JSON.stringify(measurements),
        contentType: "application/json",
      });
    } finally {
      await context.tracing.stop({
        path: evidencePath(`editor-narrow-${width}.zip`),
      });
      await instance.close();
    }
  });
}
