import { test, expect } from "@playwright/test";
import { isolatedBrowser } from "../isolated-browser.mjs";
import { driver, openDock, invokeAction } from "../dock-actions.mjs";
import { captureEvidence } from "../capture.mjs";
import { evidencePath } from "../run-evidence.mjs";

// Failure first: automatic focus on first open must retain the primary fill,
// legible text and a keyboard focus indicator, in both idle and picking states.
test("Startup: focused Hide retains contrast on first open and reopen", async () => {
  const instance = await isolatedBrowser();
  const { context, extensionId, worker } = instance;
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
    const hide = dock.locator("#hide");
    const checkContrast = async (keyboardFocus = true) => {
      await expect(hide).toBeFocused();
      await expect(hide).toHaveCSS("background-image", "none");
      if (keyboardFocus) await expect(hide).toHaveCSS("outline-style", "solid");
      const contrast = await hide.evaluate((button) => {
        const style = getComputedStyle(button);
        const luminance = (color: string) => {
          const rgb = color
            .match(/[\d.]+/g)
            .slice(0, 3)
            .map(Number)
            .map((v) => {
              const c = v / 255;
              return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
            });
          return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
        };
        const foreground = luminance(style.color);
        const background = luminance(style.backgroundColor);
        return (
          (Math.max(foreground, background) + 0.05) /
          (Math.min(foreground, background) + 0.05)
        );
      });
      expect(contrast).toBeGreaterThanOrEqual(4.5);
    };
    await checkContrast();
    await captureEvidence(page, evidencePath("first-open.png"), {
      locator: dock.locator(".dock"),
    });
    // Keep the pointer outside expanding UI: selection deliberately hands focus
    // to pointer targets, while this assertion isolates keyboard activation.
    await page.mouse.move(1, 1);
    // A slow access check must not lose keyboard focus while Hide is busy.
    await worker.evaluate(() => {
      const registered = chrome.scripting.getRegisteredContentScripts.bind(
        chrome.scripting,
      );
      chrome.scripting.getRegisteredContentScripts = async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return registered(...args);
      };
    });
    await hide.press("Enter");
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await checkContrast();
    // Pointer hover must preserve coral picking feedback after clicking Hide.
    await hide.hover();
    await expect(hide).toHaveCSS("background-color", "rgb(255, 178, 162)");
    await page.keyboard.press("Escape");
    await dock.locator("#close").click();
    await invokeAction(context, bridge, page);
    // Pointer-origin focus need not match :focus-visible; readability still must.
    await checkContrast(false);
    // Choosing another control during the pending check must keep that focus.
    await hide.press("Enter");
    await expect(hide).toHaveAttribute("aria-busy", "true");
    await dock.locator("#site-toggle").focus();
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await expect(dock.locator("#site-toggle")).toBeFocused();
  } finally {
    try {
      await context.tracing.stop({
        path: evidencePath("startup-contrast-trace.zip"),
      });
    } finally {
      await instance.close();
    }
  }
});
