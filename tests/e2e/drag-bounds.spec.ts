import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure: a projected release spring can leave the viewport despite a clamped
// endpoint; reduced motion must stop at the release point without projection.
for (const reduced of [false, true]) {
  test(`Drag release stays bounded${reduced ? " with reduced motion" : ""}`, async () => {
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
      await page.emulateMedia({
        reducedMotion: reduced ? "reduce" : "no-preference",
      });
      await page.goto("http://127.0.0.1:5173/tests/fixture.html");
      const dock = await openDock(context, bridge, page);
      const grip = dock.locator("#move"),
        panel = dock.locator(".dock");
      const box = await grip.boundingBox();
      if (!box) throw new Error("Missing grip");
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x - 500, box.y + 100, { steps: 10 });
      await page.mouse.move(box.x - 100, box.y + 100, { steps: 5 });
      const release = await panel.boundingBox();
      await page.mouse.up();
      const frames = await panel.evaluate(async (e) => {
        const frames: {
          x: number;
          right: number;
          y: number;
          bottom: number;
        }[] = [];
        for (let i = 0; i < 35; i++) {
          await new Promise(requestAnimationFrame);
          const r = e.getBoundingClientRect();
          frames.push({ x: r.x, right: r.right, y: r.y, bottom: r.bottom });
        }
        return frames;
      });
      for (const frame of frames) {
        expect(frame.x).toBeGreaterThanOrEqual(15);
        expect(frame.right).toBeLessThanOrEqual(1425);
        expect(frame.y).toBeGreaterThanOrEqual(15);
        expect(frame.bottom).toBeLessThanOrEqual(985);
        if (reduced) expect(Math.abs(frame.x - release!.x)).toBeLessThan(1);
      }
      await grip.click();
      await expect
        .poll(async () => (await panel.boundingBox())!.x)
        .toBeLessThan(20);
      await grip.focus();
      await page.keyboard.press("Enter");
      await expect
        .poll(async () => (await panel.boundingBox())!.x)
        .toBeGreaterThan(700);
    } finally {
      await context.tracing.stop({
        path: evidencePath(`drag-bounds-${reduced}.zip`),
      });
      await instance.close();
    }
  });
}
