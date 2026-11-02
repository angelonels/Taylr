import { evidencePath } from "../run-evidence.mjs";
declare global {
  interface Window {
    flipFrames: number[];
  }
}

import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startEdit, startHide } from "../dock-actions.mjs";

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
            root.querySelector(".dock").getBoundingClientRect().x,
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
    expect(frames.every((x) => Math.abs(x - 16) < 0.1)).toBe(true);
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
    // Failure first: actions must form a visible vertical column; the overlay must
    // keep its header and exit reachable as content grows and the viewport shrinks.
    const edit = await dock.locator("#edit").boundingBox();
    const hide = await dock.locator("#hide").boundingBox();
    const undo = await dock.locator("#undo").boundingBox();
    const rules = await dock.locator("#rules-toggle").boundingBox();
    expect(hide.y).toBeGreaterThanOrEqual(edit.y + edit.height);
    expect(undo.y).toBeGreaterThanOrEqual(hide.y + hide.height);
    expect(rules.y).toBeGreaterThanOrEqual(undo.y + undo.height);
    expect((await box()).width).toBeLessThanOrEqual(392);
    expect((await box()).height).toBeGreaterThan(800);
    for (const width of [320, 375, 768, 1024, 1440, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(async () => {
          const b = await box();
          return b.x >= 15 && b.x + b.width <= width - 15;
        })
        .toBe(true);
      await startHide(dock);
      await expect(dock.locator("#cancel")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dock.locator("#hide")).toBeFocused();
    }
    // The command column stays in place as details expand below it.
    const bar = await dock.locator(".panel-header").boundingBox();
    await startHide(dock);
    await expect(dock.locator("#cancel")).toBeVisible();
    await expect
      .poll(async () =>
        Math.abs((await dock.locator(".panel-header").boundingBox()).y - bar.y),
      )
      .toBeLessThan(1);
    await page.keyboard.press("Escape");
    // Shrinking and regrowing moves the panel to the left; switching must use
    // its current position, not the side it occupied before the resize.
    await page.setViewportSize({ width: 320, height: 900 });
    await expect.poll(async () => (await box()).x).toBeLessThan(50);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dock.locator("#move").focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => {
        const bounds = await box();
        return Math.abs(bounds.x + bounds.width - 1424);
      })
      .toBeLessThan(0.1);
    await page.keyboard.press("Enter");
    await expect
      .poll(async () => Math.abs((await box()).x - 16))
      .toBeLessThan(0.1);
    const top = await dock.locator(".panel-header").boundingBox();
    await startHide(dock);
    await expect(dock.locator("#cancel")).toBeVisible();
    await expect
      .poll(async () =>
        Math.abs((await dock.locator(".panel-header").boundingBox()).y - top.y),
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
    // Native 200% zoom in a short window must keep every action reachable.
    await page.setViewportSize({ width: 800, height: 400 });
    await dock.locator("#rules-toggle").click();
    await dock.locator("#restore").scrollIntoViewIfNeeded();
    await expect(dock.locator("#restore")).toBeInViewport();
    await dock.locator("#close").scrollIntoViewIfNeeded();
    await expect(dock.locator("#close")).toBeInViewport();
    await dock.locator("#rules-toggle").click();
    // Full viewport evidence avoids element-clip coordinates under native zoom.
    await page.screenshot({ path: evidencePath("dock-zoom-reduced.png") });
    await bridge.evaluate(async (url) => {
      const tab = (await chrome.tabs.query({})).find((t) => t.url === url);
      await chrome.tabs.setZoom(tab.id, 1);
    }, page.url());
    await page.setViewportSize({ width: 320, height: 400 });
    await dock.locator("#rules-toggle").click();
    await expect(dock.locator("#close")).toBeInViewport();
    await expect(dock.locator("#restore")).toBeInViewport();
    await page.setViewportSize({ width: 800, height: 200 });
    await dock.locator("#rules-toggle").scrollIntoViewIfNeeded();
    await expect(dock.locator("#rules-toggle")).toBeInViewport();
    await dock.locator("#restore").scrollIntoViewIfNeeded();
    await expect(dock.locator("#restore")).toBeInViewport();
    await dock.locator("#close").scrollIntoViewIfNeeded();
    await expect(dock.locator("#close")).toBeInViewport();
    await page.setViewportSize({ width: 320, height: 500 });
    await dock
      .locator(".dock")
      .screenshot({ path: evidencePath("vertical-panel.png") });
  } finally {
    await context.tracing.stop({
      path: evidencePath("dock-layout-trace.zip"),
    });
    await instance.close();
  }
});

// Review failure contracts: many rules must scroll below the fixed header at
// ordinary heights; an unbroken selection label must remain inside the panel.
test("Panel overflow: long rule list and unbroken selection label", async () => {
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
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("http://127.0.0.1:5173/tests/fixture.html");
    await bridge.evaluate(async () => {
      const origin = "http://127.0.0.1:5173";
      await chrome.storage.local.set({
        [`site:${origin}`]: {
          version: 1,
          origin,
          rules: Array.from({ length: 12 }, (_, i) => ({
            id: `overflow-${i}`,
            selector: `#absent-${i}`,
            label: `Hidden component ${i}`,
            createdAt: Date.now(),
          })),
        },
      });
    });
    const dock = await openDock(context, bridge, page);
    await dock.locator("#rules-toggle").click();
    await expect(dock.locator(".rule")).toHaveCount(12);
    const header = await dock.locator(".panel-header").boundingBox();
    const lastRestore = dock.locator(".rule button").last();
    await lastRestore.scrollIntoViewIfNeeded();
    await expect(lastRestore).toBeInViewport();
    expect((await dock.locator(".panel-header").boundingBox()).y).toBe(
      header.y,
    );
    await expect(dock.locator("#close")).toBeInViewport();
    await lastRestore.click();
    await expect(dock.locator(".rule")).toHaveCount(11);
    await dock.locator("#rules-toggle").click();
    await page.evaluate(() => {
      document
        .querySelector("#distraction")
        .setAttribute("aria-label", "X".repeat(500));
    });
    await startHide(dock);
    await page.locator("#distraction").hover();
    await expect(dock.locator("#selection-text")).toContainText("X".repeat(80));
    const label = await dock.locator("#selection-text").boundingBox();
    const panel = await dock.locator(".dock").boundingBox();
    expect(label.x).toBeGreaterThanOrEqual(panel.x);
    expect(label.x + label.width).toBeLessThanOrEqual(panel.x + panel.width);
    expect(
      await dock
        .locator("#selection-text")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    await page.screenshot({ path: evidencePath("panel-overflow.png") });
  } finally {
    await context.tracing.stop({
      path: evidencePath("panel-overflow-trace.zip"),
    });
    await instance.close();
  }
});

// Failure first: a short pre-lock panel clips Cancel without a wheel scroller;
// folding a locked editor shrinks the tool row until icons and labels are cut.
test("Short editors keep Cancel scrollable and folded tool labels visible", async () => {
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
    await page.setViewportSize({ width: 320, height: 480 });
    await startEdit(dock);
    const details = await dock.locator(".details").boundingBox();
    await page.mouse.move(details!.x + details!.width / 2, details!.y + 40);
    await page.mouse.wheel(0, 1000);
    await expect(dock.locator("#edit-cancel")).toBeInViewport();
    await dock.locator("#edit-cancel").click();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await startEdit(dock);
    await page.locator("#keep").click();
    await dock.locator("#edit-opacity").fill("67");
    await page.setViewportSize({ width: 320, height: 480 });
    await dock.locator("#fold").click();
    await expect
      .poll(() =>
        dock
          .locator(".tools")
          .evaluate((element) => element.scrollHeight <= element.clientHeight),
      )
      .toBe(true);
    await expect(dock.locator("#edit-save")).toBeInViewport();
    await expect(dock.locator("#close")).toBeInViewport();
    await page.screenshot({ path: evidencePath("short-folded-editor.png") });
    await dock.locator("#edit-save").click();
    await expect(dock.locator("#status")).toHaveText("Changes saved.");
    await expect(page.locator("#keep")).toHaveCSS("opacity", "0.67");
  } finally {
    try {
      await context.tracing.stop({
        path: evidencePath("short-editor-trace.zip"),
      });
    } finally {
      await instance.close();
    }
  }
});
