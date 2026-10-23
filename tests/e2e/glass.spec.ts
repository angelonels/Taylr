import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock } from "../dock-actions.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure contracts: glass loses legibility over busy pages; pointer feedback
// leaks into keyboard input; platform preferences fail to remove transparency;
// added tools push the exit away or the panel changes the website's width.
test("Glass panel: material, input feedback and platform preferences", async () => {
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
    const width = await page.evaluate(
      () => document.body.getBoundingClientRect().width,
    );
    const dock = await openDock(context, bridge, page);
    await expect(dock.locator(".brand")).toHaveText("Taylr");
    const material = await dock
      .locator(".dock")
      .evaluate((el) => getComputedStyle(el).backdropFilter);
    expect(material).toContain("blur(");
    await expect(dock.locator("#site-toggle")).toBeVisible();
    const hide = dock.locator("#hide");
    const toolBounds = await dock.locator(".tools").boundingBox();
    const hideBounds = await hide.boundingBox();
    // The scrollport must leave room for the full 2px ring + 2px offset.
    expect(hideBounds.x - toolBounds.x).toBeGreaterThanOrEqual(4);
    expect(
      toolBounds.x + toolBounds.width - hideBounds.x - hideBounds.width,
    ).toBeGreaterThanOrEqual(4);

    await hide.hover();
    await page.mouse.down();
    await expect
      .poll(() => hide.evaluate((el) => getComputedStyle(el).transform))
      .not.toBe("none");
    await page.mouse.up();
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await dock
      .locator(".dock")
      .screenshot({ path: evidencePath("glass-picking.png") });
    await page.keyboard.press("Escape");
    await hide.focus();
    await page.keyboard.down("Space");
    expect(await hide.evaluate((el) => getComputedStyle(el).transform)).toBe(
      "none",
    );
    await page.keyboard.up("Space");
    await page.keyboard.press("Escape");
    await page.screenshot({ path: evidencePath("glass-panel.png") });
    await dock.locator("#rules-toggle").click();
    await expect(dock.locator("#taylr-rules")).toBeVisible();
    await page.screenshot({ path: evidencePath("glass-rules.png") });
    await page.emulateMedia({ reducedMotion: "reduce", contrast: "more" });
    expect(
      await dock
        .locator(".dock")
        .evaluate((el) => getComputedStyle(el).backdropFilter),
    ).toBe("none");
    await hide.hover();
    await page.mouse.down();
    expect(await hide.evaluate((el) => getComputedStyle(el).transform)).toBe(
      "none",
    );
    await page.mouse.up();
    expect(
      await page.evaluate(() => document.body.getBoundingClientRect().width),
    ).toBe(width);
    await page.screenshot({ path: evidencePath("glass-accessible.png") });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
    });
    expect(
      await dock
        .locator(".dock")
        .evaluate((el) => getComputedStyle(el).backdropFilter),
    ).toBe("none");
    await cdp.detach();
    await page.emulateMedia({
      reducedMotion: "no-preference",
      contrast: "no-preference",
    });
    await page.keyboard.press("Escape");
    // Simulate future tools without adding placeholder features to the product.
    await dock.locator(".tools").evaluate((el) => {
      for (let index = 0; index < 20; index++) {
        const button = document.createElement("button");
        button.textContent = `Future tool ${index}`;
        el.append(button);
      }
    });
    const header = await dock.locator(".panel-header").boundingBox();
    await dock.locator(".tools button").last().scrollIntoViewIfNeeded();
    await expect(dock.locator(".tools button").last()).toBeInViewport();
    await expect(dock.locator("#close")).toBeInViewport();
    expect((await dock.locator(".panel-header").boundingBox()).y).toBe(
      header.y,
    );
  } finally {
    await context.tracing.stop({ path: evidencePath("glass-trace.zip") });
    await instance.close();
  }
});
