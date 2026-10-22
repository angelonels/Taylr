import { evidencePath } from "../run-evidence.mjs";
declare global {
  interface Window {
    flipFrames: number[];
  }
}

import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";

// Failure contract: keyboard grip activation must jump immediately, and a held
// keyboard press must not shrink controls. Pointer release keeps its spring.
test("Keyboard grip: instant flip and no press scale", async () => {
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
    await dock.locator("#move").focus();
    await page.evaluate(() => {
      const root = document.querySelector("taylr-tools").shadowRoot;
      window.flipFrames = [];
      root.querySelector("#move").addEventListener("click", () => {
        let frames = 0;
        const record = () => {
          window.flipFrames.push(
            root.querySelector(".dock").getBoundingClientRect().y,
          );
          if (++frames < 4) requestAnimationFrame(record);
        };
        requestAnimationFrame(record);
      });
    });
    await page.keyboard.press("Enter");
    await expect
      .poll(() => page.evaluate(() => window.flipFrames.length))
      .toBe(4);
    const frames = await page.evaluate(() => window.flipFrames);
    expect(frames.every((y) => Math.abs(y - 16) < 0.1)).toBe(true);
    await page.keyboard.down("Space");
    expect(
      await dock
        .locator("#move")
        .evaluate((el) => getComputedStyle(el).transform),
    ).toBe("none");
    await page.keyboard.up("Space");
  } finally {
    await context.tracing.stop({
      path: evidencePath("dock-keyboard-motion-trace.zip"),
    });
    await instance.close();
  }
});

// Failure contracts: no viewport overflow, expansion must preserve the command bar,
// native browser zoom keeps the exit reachable, and reduced motion stays usable.
test("Dock layout: six widths, native 200% zoom, edge expansion and reduced motion", async () => {
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
    const box = () => dock.locator(".dock").boundingBox();
    for (const width of [320, 375, 768, 1024, 1440, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(async () => {
          const b = await box();
          return b.x >= 15 && b.x + b.width <= width - 15;
        })
        .toBe(true);
      await dock.locator("#hide").click();
      await expect(dock.locator("#cancel")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dock.locator("#hide")).toBeFocused();
    }
    // React focus settles before ResizeObserver fits the collapsed dock. Wait for
    // its actual bottom anchor before measuring the next expansion.
    await expect
      .poll(async () => {
        const b = await box();
        return Math.abs(b.y + b.height - 884);
      })
      .toBeLessThan(0.1);
    const bar = await dock.locator(".bar").boundingBox();
    await dock.locator("#hide").click();
    await expect
      .poll(async () =>
        Math.abs((await dock.locator(".bar").boundingBox()).y - bar.y),
      )
      .toBeLessThan(1);
    await page.keyboard.press("Escape");
    await dock.locator("#move").click();
    await expect
      .poll(async () => Math.abs((await box()).y - 16))
      .toBeLessThan(0.1);
    const top = await dock.locator(".bar").boundingBox();
    await dock.locator("#hide").click();
    await expect
      .poll(async () =>
        Math.abs((await dock.locator(".bar").boundingBox()).y - top.y),
      )
      .toBeLessThan(1);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 800, height: 900 });
    await bridge.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
      await chrome.tabs.setZoom(tab.id, 2);
    }, page.url());
    await expect(dock.locator("#close")).toBeInViewport();
    await dock.locator("#hide").focus();
    await page.keyboard.press("Enter");
    await expect(dock.locator("#cancel")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    await dock.locator("#move").focus();
    await page.keyboard.press("Home");
    await expect(dock.locator("#close")).toBeInViewport();
    // Full viewport evidence avoids element-clip coordinates under native zoom.
    await page.screenshot({ path: evidencePath("dock-zoom-reduced.png") });
  } finally {
    await context.tracing.stop({
      path: evidencePath("dock-layout-trace.zip"),
    });
    await instance.close();
  }
});
