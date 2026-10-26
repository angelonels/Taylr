import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, startHide } from "../dock-actions.mjs";
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
    // Registration is asynchronous; test Escape from the picking state rather
    // than racing it against the legitimate close action while still idle.
    await expect(hide).toHaveAttribute("aria-pressed", "true");
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

// A blur declaration alone is insufficient: the rendered surface must transmit
// a visible amount of the page color, including the primary action.
test("Frosted glass transmits the page behind the panel", async () => {
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
    const alpha = await dock
      .locator(".dock")
      .evaluate((el) =>
        Number(getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.[3] ?? 1),
      );
    expect(alpha).toBeLessThanOrEqual(0.5);
    await page.evaluate(() => {
      const backdrop = document.createElement("div");
      backdrop.id = "glass-backdrop";
      backdrop.style.cssText =
        "position:fixed;inset:0;z-index:2147483000;background:#ff4040";
      document.body.append(backdrop);
    });
    const sample = async () => {
      const screenshot = await dock.locator(".dock").screenshot();
      return page.evaluate(async (data) => {
        const img = new Image();
        img.src = `data:image/png;base64,${data}`;
        await img.decode();
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        return Array.from(
          ctx.getImageData(img.width - 8, Math.floor(img.height / 2), 1, 1)
            .data,
        ).slice(0, 3);
      }, screenshot.toString("base64"));
    };
    const red = await sample();
    await page.locator("#glass-backdrop").evaluate((el) => {
      el.style.background = "#4040ff";
    });
    const blue = await sample();
    expect(red[0] - blue[0]).toBeGreaterThan(35);
    expect(blue[2] - red[2]).toBeGreaterThan(35);
    for (const theme of ["light", "dark"]) {
      await page.locator("#glass-backdrop").evaluate((el, theme) => {
        el.style.background = `repeating-linear-gradient(125deg, transparent 0 65px, #ffffff80 65px 115px), radial-gradient(ellipse at 90% 20%, #447eff, transparent 45%), radial-gradient(ellipse at 85% 60%, #ff745e, transparent 35%), ${theme === "light" ? "#edf3f8" : "#101522"}`;
      }, theme);
      await page.screenshot({ path: evidencePath(`frosted-${theme}.png`) });
      await startHide(dock);
      await expect
        .poll(() =>
          dock
            .locator(".details")
            .evaluate((el) => getComputedStyle(el).opacity),
        )
        .toBe("1");
      await page.screenshot({
        path: evidencePath(`frosted-${theme}-picking.png`),
      });
      await page.keyboard.press("Escape");
    }
  } finally {
    await context.tracing.stop({
      path: evidencePath("frosted-transmission-trace.zip"),
    });
    await instance.close();
  }
});
